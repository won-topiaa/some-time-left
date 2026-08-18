/**
 * 서울 실시간 인구데이터 업스트림.
 *
 * 이 API는 평문 HTTP 전용이다 — 443과 8088 양쪽에 TLS를 시도하면 둘 다
 * connection reset으로 끊긴다. iOS의 App Transport Security가 평문 HTTP를
 * 기본 차단하므로 앱에서 직접 부를 수 없고, 그래서 이 프록시가 존재한다.
 *
 * 앱에는 정규화된 작은 응답만 내려보낸다. 서울 쪽 스키마가 바뀌어도
 * 앱이 아니라 여기만 고치면 된다.
 */

export const CONGESTION_LEVELS = ['여유', '보통', '약간 붐빔', '붐빔'] as const;
export type CongestionLevel = (typeof CONGESTION_LEVELS)[number];

export interface AreaPopulation {
  areaName: string;
  level: CongestionLevel;
  /** 서울이 알려주는 갱신 시각. 없으면 생략된다. */
  updatedAt?: string;
}

/**
 * 장소명 검증.
 *
 * 이 프록시는 서울 URL만 조립하므로 범용 릴레이로 악용되지는 않는다.
 * 그래도 말도 안 되는 길이나 경로 문자가 들어오면 업스트림에 보내지 않는다.
 */
export function isValidAreaName(name: string): boolean {
  if (name.length === 0 || name.length > 40) {
    return false;
  }
  return !/[/\\?#]/.test(name);
}

export function toCongestionLevel(raw: unknown): CongestionLevel | null {
  return CONGESTION_LEVELS.includes(raw as CongestionLevel) ? (raw as CongestionLevel) : null;
}

interface PopulationRow {
  AREA_NM?: string;
  AREA_CONGEST_LVL?: string;
  PPLTN_TIME?: string;
}

interface CityDataResponse {
  'SeoulRtd.citydata_ppltn'?: PopulationRow[];
  RESULT?: { 'RESULT.CODE'?: string; 'RESULT.MESSAGE'?: string };
}

/** 서울 응답 → 앱이 받을 작은 형태. 읽을 수 없으면 null. */
export function normalizePopulation(
  response: CityDataResponse,
  fallbackAreaName: string
): AreaPopulation | null {
  const row = response['SeoulRtd.citydata_ppltn']?.[0];
  const level = toCongestionLevel(row?.AREA_CONGEST_LVL);

  if (level == null) {
    return null;
  }

  const areaName = row?.AREA_NM != null && row.AREA_NM !== '' ? row.AREA_NM : fallbackAreaName;
  const updatedAt = row?.PPLTN_TIME;

  return { areaName, level, ...(updatedAt != null && updatedAt !== '' ? { updatedAt } : {}) };
}

export interface SeoulUpstream {
  baseUrl: string;
  key: string;
}

export function populationUrl({ baseUrl, key }: SeoulUpstream, areaName: string): string {
  return `${baseUrl}/${key}/json/citydata_ppltn/1/5/${encodeURIComponent(areaName)}`;
}

/** 한 장소의 현재 혼잡도. 실패하면 null — 부분 실패가 전체를 막지 않는다. */
export async function fetchPopulation(
  upstream: SeoulUpstream,
  areaName: string,
  timeoutMs: number
): Promise<AreaPopulation | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(populationUrl(upstream, areaName), {
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    return normalizePopulation((await response.json()) as CityDataResponse, areaName);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

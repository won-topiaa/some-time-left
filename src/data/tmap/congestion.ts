/**
 * TMAP Puzzle 장소 혼잡도.
 *
 * 두 엔드포인트를 쓴다.
 *   GET /puzzle/place/meta/pois            데이터 제공 가능 장소 목록 (문서 확인)
 *   GET /puzzle/place/congestion/rltm/pois/{poiId}   실시간 혼잡도 (경로만 확인)
 *
 * 중요한 성질 하나: **목록 응답에 좌표가 없다.** poiId와 이름만 온다.
 * 좌표가 필요하면 `/tmap/pois/{poiId}`로 한 번 더 해석해야 한다.
 * 목록이 200곳 남짓이라 앱 시작 시 한 번 받아두면 충분하다.
 */

import { getApiConfig } from '../../config';
import { requestJson } from '../http';

export interface CongestionPlace {
  poiId: string;
  poiName: string;
}

interface MetaPoisResponse {
  status?: {
    code?: string;
    message?: string;
    totalCount?: number | string;
    offset?: number;
    limit?: number;
  };
  contents?: { poiId?: string; poiName?: string }[];
}

/** 한 번에 가져올 수 있는 최대 개수. 문서 기준. */
export const MAX_LIMIT = 1000;

export function parseMetaPois(response: MetaPoisResponse): CongestionPlace[] {
  // 조회 실패는 status.code가 '00'이 아니다.
  if (response.status?.code != null && response.status.code !== '00') {
    return [];
  }

  return (response.contents ?? []).flatMap((row) => {
    if (row.poiId == null || row.poiId === '' || row.poiName == null) {
      return [];
    }
    return [{ poiId: row.poiId, poiName: row.poiName }];
  });
}

/** 응답의 전체 건수. 페이지를 더 받아야 하는지 판단한다. */
export function totalCountOf(response: MetaPoisResponse): number {
  const raw = response.status?.totalCount;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function headers(): Record<string, string> {
  const { tmap } = getApiConfig();
  const base: Record<string, string> = { Accept: 'application/json' };
  if (tmap.appKey != null) {
    base.appKey = tmap.appKey;
  }
  return base;
}

/** 혼잡도 데이터가 있는 장소 목록. 200곳 남짓이라 한 번에 받아진다. */
export async function fetchCongestionPlaces(
  offset = 0,
  limit = 200
): Promise<{ places: CongestionPlace[]; totalCount: number }> {
  const { tmap } = getApiConfig();

  const params = new URLSearchParams({
    offset: String(offset),
    limit: String(Math.min(limit, MAX_LIMIT)),
  });

  const response = await requestJson<MetaPoisResponse>(
    `${tmap.baseUrl}/puzzle/place/meta/pois?${params.toString()}`,
    { method: 'GET', headers: headers() }
  );

  return { places: parseMetaPois(response), totalCount: totalCountOf(response) };
}

/** 혼잡도 등급. 서울 API와 같은 4단계로 맞춰 쓴다. */
export type CongestionLevel = 1 | 2 | 3 | 4;

export interface PlaceCongestion {
  poiId: string;
  level: CongestionLevel;
}

/** 등급별 표시 문구. 도착 화면에서 한 줄로 보여준다. */
export const CONGESTION_LABEL: Record<CongestionLevel, string> = {
  1: '한산해요',
  2: '보통이에요',
  3: '조금 붐벼요',
  4: '붐벼요',
};

function toLevel(raw: unknown): CongestionLevel | null {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return null;
  }
  // 1~4 등급으로 오는 경우
  if (value >= 1 && value <= 4 && Number.isInteger(value)) {
    return value as CongestionLevel;
  }
  // 0~1 비율로 오는 경우
  if (value >= 0 && value <= 1) {
    if (value < 0.25) return 1;
    if (value < 0.5) return 2;
    if (value < 0.75) return 3;
    return 4;
  }
  return null;
}

interface CongestionResponse {
  status?: { code?: string };
  contents?: {
    poiId?: string;
    rltm?: { congestionLevel?: unknown; congestion?: unknown }[];
    congestionLevel?: unknown;
    congestion?: unknown;
  };
}

/**
 * 혼잡도 응답 파서.
 *
 * 경로는 확인했지만(`INVALID_API_KEY` 응답) **응답 구조는 미확인이다.**
 * Puzzle 계열의 통상적인 형태(`contents.rltm[0]`)와 평탄한 형태를 모두 받도록
 * 열어 두었고, 어느 쪽으로도 못 읽으면 null을 돌려 화면에서 조용히 생략된다.
 * 실제 키로 한 번 호출해 필드명을 확인한 뒤 이 함수를 좁히면 된다.
 */
export function parseCongestion(response: CongestionResponse): PlaceCongestion | null {
  if (response.status?.code != null && response.status.code !== '00') {
    return null;
  }

  const contents = response.contents;
  if (contents?.poiId == null || contents.poiId === '') {
    return null;
  }

  const latest = contents.rltm?.[0];
  const candidates = [
    latest?.congestionLevel,
    latest?.congestion,
    contents.congestionLevel,
    contents.congestion,
  ];

  for (const candidate of candidates) {
    const level = toLevel(candidate);
    if (level != null) {
      return { poiId: contents.poiId, level };
    }
  }
  return null;
}

/** 한 장소의 실시간 혼잡도. 못 읽으면 null — 화면에서 그냥 생략한다. */
export async function fetchPlaceCongestion(poiId: string): Promise<PlaceCongestion | null> {
  const { tmap } = getApiConfig();

  const response = await requestJson<CongestionResponse>(
    `${tmap.baseUrl}/puzzle/place/congestion/rltm/pois/${encodeURIComponent(poiId)}`,
    { method: 'GET', headers: headers() }
  );

  return parseCongestion(response);
}

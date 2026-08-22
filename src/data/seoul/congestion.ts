/**
 * 혼잡도 (서울시 실시간 인구데이터).
 *
 * 통신사 기지국 집계를 5분 단위로 갱신한다. 우리에게 필요한 건 딱 하나,
 * "이 길이 한적한가"이다.
 *
 * 서울 API는 평문 HTTP 전용이라 iOS에서 직접 부를 수 없다. 그래서 앱은
 * `proxy/`의 HTTPS 프록시를 부르고, 인증키는 프록시에만 둔다.
 * 프록시는 여러 장소를 한 번에 받으므로 왕복이 한 번으로 끝난다.
 *
 * 한계: 서울 주요 장소 중심이라 그 밖의 동네는 값이 없다.
 * 모르는 건 모른다고 두고 중립값으로 떨어뜨린다.
 */

import { getApiConfig } from '../../config';
import { requestJson } from '../http';
import { distanceM } from '../../domain/geo';
import type { LatLng } from '../../domain/types';
import { HOTSPOT_RADIUS_M, SEOUL_HOTSPOTS, type Hotspot } from './hotspots';

/** API가 돌려주는 혼잡도 등급. */
export type CongestionLevel = '여유' | '보통' | '약간 붐빔' | '붐빔';

export interface AreaCongestion {
  areaName: string;
  at: LatLng;
  level: CongestionLevel;
}

/** 등급 → 한적함 점수. 이 앱은 '붐빔'을 피하고 싶은 것이지 측정하려는 게 아니다. */
const QUIET_BY_LEVEL: Record<CongestionLevel, number> = {
  여유: 1,
  보통: 0.65,
  '약간 붐빔': 0.35,
  붐빔: 0,
};

/** 값을 모를 때. 있는 척하지 않는다. */
export const NEUTRAL_QUIET = 0.5;

/** 프록시가 정규화해서 내려주는 형태. 서울 원본 스키마는 프록시가 감춘다. */
interface ProxyArea {
  areaName?: string;
  level?: string;
  updatedAt?: string;
}

interface ProxyResponse {
  areas?: ProxyArea[];
}

function toLevel(raw: string | undefined): CongestionLevel | null {
  if (raw === '여유' || raw === '보통' || raw === '약간 붐빔' || raw === '붐빔') {
    return raw;
  }
  return null;
}

/** 프록시 응답 → 좌표가 붙은 혼잡도. 순수 함수. */
export function parseProxyAreas(
  response: ProxyResponse,
  hotspots: Hotspot[] = SEOUL_HOTSPOTS
): AreaCongestion[] {
  return (response.areas ?? []).flatMap((area) => {
    const level = toLevel(area.level);
    const hotspot = hotspots.find((h) => h.areaName === area.areaName);

    // 프록시가 아는 장소라도 우리 좌표 목록에 없으면 경로와 대조할 수 없다.
    if (level == null || hotspot == null) {
      return [];
    }
    return [{ areaName: hotspot.areaName, at: hotspot.at, level }];
  });
}

/**
 * 경로가 지나는 장소들. API가 한 번에 한 곳씩만 받으므로 먼저 추려야 한다.
 *
 * 상자 비교를 먼저 한다. 목록이 121곳으로 늘면서 경로 점 하나하나와 다 재면
 * 수십만 번의 하버사인이 되는데, Hermes에는 JIT이 없어 그게 화면 멈춤이 된다
 * (공원 거르기 `parksNear`와 같은 이유·같은 방법). 경로를 담는 사각형 밖의
 * 장소는 곱셈 네 번으로 떨어져 나간다.
 */
export function hotspotsAlong(
  path: LatLng[],
  hotspots: Hotspot[] = SEOUL_HOTSPOTS
): Hotspot[] {
  if (path.length === 0) {
    return [];
  }

  const latPad = HOTSPOT_RADIUS_M / 111_320;
  const lngPad =
    HOTSPOT_RADIUS_M / (111_320 * Math.max(0.2, Math.cos((path[0].lat * Math.PI) / 180)));

  const box = path.reduce(
    (acc, p) => ({
      minLat: Math.min(acc.minLat, p.lat),
      maxLat: Math.max(acc.maxLat, p.lat),
      minLng: Math.min(acc.minLng, p.lng),
      maxLng: Math.max(acc.maxLng, p.lng),
    }),
    { minLat: Infinity, maxLat: -Infinity, minLng: Infinity, maxLng: -Infinity }
  );

  return hotspots.filter(
    (hotspot) =>
      hotspot.at.lat >= box.minLat - latPad &&
      hotspot.at.lat <= box.maxLat + latPad &&
      hotspot.at.lng >= box.minLng - lngPad &&
      hotspot.at.lng <= box.maxLng + lngPad &&
      path.some((point) => distanceM(point, hotspot.at) <= HOTSPOT_RADIUS_M)
  );
}

/** 도착 화면 한 줄에 쓰는 말. 등급을 숫자나 원문 그대로 내보이지 않는다. */
export const CONGESTION_WORD: Record<CongestionLevel, string> = {
  여유: '한산해요',
  보통: '보통이에요',
  '약간 붐빔': '조금 붐벼요',
  붐빔: '붐벼요',
};

/** 좌표에서 가장 가까운 장소. 반경 밖이면 null — 억지로 먼 동네 값을 씌우지 않는다. */
export function nearestHotspot(
  at: LatLng,
  hotspots: Hotspot[] = SEOUL_HOTSPOTS,
  radiusM: number = HOTSPOT_RADIUS_M
): Hotspot | null {
  let best: Hotspot | null = null;
  let bestM = radiusM;

  for (const hotspot of hotspots) {
    const d = distanceM(at, hotspot.at);
    if (d <= bestM) {
      best = hotspot;
      bestM = d;
    }
  }
  return best;
}

/**
 * 한 지점(약속 장소)의 현재 혼잡도.
 *
 * TMAP Puzzle을 쓰다가 이쪽으로 옮겼다. Puzzle은 앱 키의 월 사용량을 먹는데
 * (실제로 한 달 80%를 썼다), 서울 인구데이터는 **우리 프록시가 이미 받고 있고**
 * 프록시가 5분씩 캐시하므로 같은 동네를 여럿이 물어도 업스트림 호출은 하나다.
 * 앱에는 키가 아예 없다 — quiet 점수가 쓰는 바로 그 자리다.
 *
 * 대상은 서울 주요 장소들이다. 목록 밖이면 null이고, 도착 화면은 그 줄을 안 그린다 —
 * Puzzle 때(대형 쇼핑몰 200곳)와 같은 성질이고, 걷는 약속 장소와는 이쪽이 더 겹친다.
 */
export async function fetchCongestionAt(at: LatLng): Promise<AreaCongestion | null> {
  const hotspot = nearestHotspot(at);
  if (hotspot == null) {
    return null;
  }

  const areas = await fetchCongestionAreas([hotspot]);
  return areas.find((area) => area.areaName === hotspot.areaName) ?? null;
}

/**
 * 경로가 지나는 장소들의 현재 혼잡도.
 * 프록시가 없으면 빈 배열 — `scoreQuiet`이 중립값으로 떨어진다.
 */
export async function fetchCongestionAlong(path: LatLng[]): Promise<AreaCongestion[]> {
  return fetchCongestionAreas(hotspotsAlong(path));
}

/**
 * 프록시가 한 요청에서 받아 주는 장소 수 (proxy MAX_AREAS 기본값과 같다).
 *
 * 넘치면 프록시가 **조용히 앞의 12개만 조회한다** — 응답에는 잘렸다는 표시가
 * 없어서, 모르고 다 넣으면 뒤쪽 동네들이 전부 "모름(중립값)"이 된다.
 * 장소가 121곳이 되면서 도심 경로 하나가 12곳을 넘는 일이 실제로 생긴다.
 */
const PROXY_MAX_AREAS = 12;

/** 장소 목록의 혼잡도를 프록시에서 받는다. 12곳씩 끊어 나란히 보낸다. */
async function fetchCongestionAreas(targets: Hotspot[]): Promise<AreaCongestion[]> {
  const { congestionProxy } = getApiConfig();
  if (congestionProxy.baseUrl == null || targets.length === 0) {
    return [];
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (congestionProxy.token != null) {
    headers.Authorization = `Bearer ${congestionProxy.token}`;
  }

  const chunks: Hotspot[][] = [];
  for (let i = 0; i < targets.length; i += PROXY_MAX_AREAS) {
    chunks.push(targets.slice(i, i + PROXY_MAX_AREAS));
  }

  const responses = await Promise.all(
    chunks.map((chunk) => {
      const params = new URLSearchParams();
      for (const hotspot of chunk) {
        params.append('area', hotspot.areaName);
      }
      return requestJson<ProxyResponse>(
        `${congestionProxy.baseUrl}/population?${params.toString()}`,
        { method: 'GET', headers }
      ).catch(() => ({ areas: [] }) as ProxyResponse);
      // 한 묶음이 실패해도 나머지는 쓴다. 부분 실패가 전체를 중립으로 만들면 아깝다.
    })
  );

  return responses.flatMap((response) => parseProxyAreas(response));
}

/**
 * 경로의 한적함 (0~1). 순수 함수.
 *
 * 각 좌표에 가장 가까운 장소의 혼잡도를 적용하고, 어느 장소에도 안 걸리는
 * 좌표는 중립으로 둔다. 붐비는 곳을 스쳐 지나가는 정도라면 전체 점수가
 * 크게 깎이지 않아야 한다 — 그래서 좌표 단위 평균이다.
 */
export function scoreQuiet(path: LatLng[], areas: AreaCongestion[]): number {
  if (path.length === 0) {
    return NEUTRAL_QUIET;
  }
  if (areas.length === 0) {
    return NEUTRAL_QUIET;
  }

  let total = 0;
  for (const point of path) {
    let nearest: AreaCongestion | null = null;
    let nearestDistance = Infinity;

    for (const area of areas) {
      const d = distanceM(point, area.at);
      if (d <= HOTSPOT_RADIUS_M && d < nearestDistance) {
        nearestDistance = d;
        nearest = area;
      }
    }

    total += nearest == null ? NEUTRAL_QUIET : QUIET_BY_LEVEL[nearest.level];
  }

  return total / path.length;
}

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

/** 경로가 지나는 장소들. API가 한 번에 한 곳씩만 받으므로 먼저 추려야 한다. */
export function hotspotsAlong(
  path: LatLng[],
  hotspots: Hotspot[] = SEOUL_HOTSPOTS
): Hotspot[] {
  return hotspots.filter((hotspot) =>
    path.some((point) => distanceM(point, hotspot.at) <= HOTSPOT_RADIUS_M)
  );
}

/**
 * 경로가 지나는 장소들의 현재 혼잡도.
 * 프록시가 없으면 빈 배열 — `scoreQuiet`이 중립값으로 떨어진다.
 */
export async function fetchCongestionAlong(path: LatLng[]): Promise<AreaCongestion[]> {
  const { congestionProxy } = getApiConfig();
  if (congestionProxy.baseUrl == null) {
    return [];
  }

  const targets = hotspotsAlong(path);
  if (targets.length === 0) {
    return [];
  }

  const params = new URLSearchParams();
  for (const hotspot of targets) {
    params.append('area', hotspot.areaName);
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (congestionProxy.token != null) {
    headers.Authorization = `Bearer ${congestionProxy.token}`;
  }

  const response = await requestJson<ProxyResponse>(
    `${congestionProxy.baseUrl}/population?${params.toString()}`,
    { method: 'GET', headers }
  );

  return parseProxyAreas(response);
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

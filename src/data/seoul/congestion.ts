/**
 * 서울시 실시간 인구데이터 (혼잡도).
 *
 * 통신사 기지국 집계를 5분 단위로 갱신한다. 우리에게 필요한 건 딱 하나,
 * "이 길이 한적한가"이다.
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

interface PopulationRow {
  AREA_NM?: string;
  AREA_CONGEST_LVL?: string;
}

interface CityDataPopulationResponse {
  'SeoulRtd.citydata_ppltn'?: PopulationRow[];
}

function toLevel(raw: string | undefined): CongestionLevel | null {
  if (raw === '여유' || raw === '보통' || raw === '약간 붐빔' || raw === '붐빔') {
    return raw;
  }
  return null;
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

async function fetchArea(areaName: string): Promise<AreaCongestion | null> {
  const { seoul } = getApiConfig();
  if (seoul.key == null) {
    return null;
  }

  const url = `${seoul.baseUrl}/${seoul.key}/json/citydata_ppltn/1/5/${encodeURIComponent(areaName)}`;
  const response = await requestJson<CityDataPopulationResponse>(url, { method: 'GET' });

  const row = response['SeoulRtd.citydata_ppltn']?.[0];
  const level = toLevel(row?.AREA_CONGEST_LVL);
  const hotspot = SEOUL_HOTSPOTS.find((h) => h.areaName === areaName);

  if (level == null || hotspot == null) {
    return null;
  }
  return { areaName, at: hotspot.at, level };
}

/** 경로가 지나는 장소들의 현재 혼잡도. 실패한 곳은 빼고 돌려준다. */
export async function fetchCongestionAlong(path: LatLng[]): Promise<AreaCongestion[]> {
  const targets = hotspotsAlong(path);
  if (targets.length === 0) {
    return [];
  }

  const results = await Promise.allSettled(targets.map((h) => fetchArea(h.areaName)));

  return results.flatMap((result) =>
    result.status === 'fulfilled' && result.value != null ? [result.value] : []
  );
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

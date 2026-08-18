/**
 * 경로 주변 환경 데이터를 한 번에 모은다.
 *
 * 세 곳에서 온다.
 *   혼잡도 — 서울 실시간 인구데이터
 *   공원·수변 — 전국도시공원표준데이터
 *   건물 높이 — 브이월드 건물 레이어 (그늘 계산용)
 *
 * 전부 실패해도 경로 추천은 계속돼야 한다. 하나라도 못 받으면 그 성질만
 * 중립값으로 떨어지고, 나머지는 그대로 쓴다.
 */

import { fetchCongestionAlong, type AreaCongestion } from './seoul/congestion';
import { fetchParks, type Park } from './parks/client';
import { parksNear } from './parks/scenic';
import { fetchBuildings } from './buildings/vworld';
import type { Building } from './buildings/types';
import type { LatLng } from '../domain/types';

export interface Environment {
  congestion: AreaCongestion[];
  parks: Park[];
  buildings: Building[];
}

export const EMPTY_ENVIRONMENT: Environment = {
  congestion: [],
  parks: [],
  buildings: [],
};

/** 공원 목록은 자주 안 바뀐다. 세션 동안 한 번만 받는다. */
let parkCache: { sido: string; parks: Park[] } | null = null;

async function loadParks(sido: string): Promise<Park[]> {
  if (parkCache?.sido === sido) {
    return parkCache.parks;
  }
  const parks = await fetchParks(sido);
  parkCache = { sido, parks };
  return parks;
}

export function clearParkCache(): void {
  parkCache = null;
}

/**
 * 후보 경로들을 모두 덮는 환경 데이터.
 *
 * 경로마다 따로 부르면 같은 동네를 여러 번 조회하게 된다.
 * 후보들의 좌표를 합쳐 한 번만 받고 각 경로가 나눠 쓴다.
 */
export async function loadEnvironment(
  paths: LatLng[][],
  sido = '서울특별시'
): Promise<Environment> {
  const allPoints = paths.flat();
  if (allPoints.length === 0) {
    return EMPTY_ENVIRONMENT;
  }

  const [congestion, parks, buildings] = await Promise.all([
    fetchCongestionAlong(allPoints).catch(() => [] as AreaCongestion[]),
    loadParks(sido)
      .then((all) => parksNear(all, allPoints))
      .catch(() => [] as Park[]),
    fetchBuildings(allPoints).catch(() => [] as Building[]),
  ]);

  return { congestion, parks, buildings };
}

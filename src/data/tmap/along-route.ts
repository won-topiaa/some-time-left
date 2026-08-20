/**
 * 가는 길에 곁을 스치는 가게 한 곳.
 *
 * 목적이 아니다. "이 길로 가면 △△가 있어요" 하고 한 줄 언급하는 정도.
 * 우연히 지나치다 들르는 가게라는 감성이라, 목록이 아니라 **딱 하나**만,
 * 그리고 없으면 **없는 채로** 둔다 — 억지로 만들면 우연이 아니게 된다.
 *
 * 소스는 TMAP POI 검색(좌표 기반)이다. 경로 위에 실제로 뭐가 있는지는
 * 좌표 질의라야 알 수 있다. Puzzle(음식점·혼잡도)은 지역 통계라 나중에
 * "지금 한산한 카페처럼" 꾸미는 데 쓸 수 있고, 여기선 소스로 쓰지 않는다.
 */

import { getApiConfig } from '../../config';
import { requestJson } from '../http';
import { projectToPath } from '../../domain/geo';
import type { LatLng } from '../../domain/types';
import type { TmapPoiResponse } from './types';
import { parsePoi, type Place } from './parse';

export interface AlongRoutePlace {
  name: string;
  at: LatLng;
  /** 무엇으로 찾았는지 (카페·베이커리 …). 문구에 쓸 수 있다. */
  category: string;
  poiId?: string;
}

/**
 * 잠깐(3~5분) 들를 만한 곳의 감성. 앉아서 밥 먹는 식당이 아니라
 * 스쳐 들르는 곳 — 카페·베이커리·디저트.
 */
export const QUICK_STOP_CATEGORIES = ['카페', '베이커리', '디저트', '책방', '소품샵'] as const;

export interface PickOptions {
  /** 이 거리 안이라야 "길 곁"으로 본다 (m). */
  nearM?: number;
  /** 경로 양 끝 이 비율 안쪽은 제외한다 — 문 앞·도착점 코앞은 우연이 아니다. */
  edgeRatio?: number;
}

/**
 * 후보들 중 경로 곁의 한 곳. 순수 함수.
 *
 * 길에서 `nearM` 안에 있고, 양 끝을 뺀 가운데 구간에 있는 것들 중
 * **가장 길 한복판(진행 비율 0.5)에 가까운** 하나를 고른다.
 * 무작위가 아니라 결정적으로 — 같은 경로엔 같은 가게가 떠올라야 한다.
 */
export function pickAlongRoute(
  path: LatLng[],
  candidates: Place[],
  { nearM = 45, edgeRatio = 0.2 }: PickOptions = {}
): AlongRoutePlace | null {
  if (path.length < 2 || candidates.length === 0) {
    return null;
  }

  let best: { place: Place; centrality: number } | null = null;

  for (const candidate of candidates) {
    const { distanceM, alongRatio } = projectToPath(path, candidate.at);

    if (distanceM > nearM) {
      continue;
    }
    if (alongRatio < edgeRatio || alongRatio > 1 - edgeRatio) {
      continue;
    }

    // 길 한복판일수록 좋다 (우연히 지나치는 지점).
    const centrality = Math.abs(alongRatio - 0.5);
    if (best == null || centrality < best.centrality) {
      best = { place: candidate, centrality };
    }
  }

  if (best == null) {
    return null;
  }

  return {
    name: best.place.name,
    at: best.place.at,
    category: '',
    ...(best.place.poiId != null ? { poiId: best.place.poiId } : {}),
  };
}

function headers(): Record<string, string> {
  const { tmap } = getApiConfig();
  const base: Record<string, string> = { Accept: 'application/json' };
  if (tmap.appKey != null) {
    base.appKey = tmap.appKey;
  }
  return base;
}

/** 경로 중간 지점 주변에서 한 범주를 검색한다. */
async function searchNear(keyword: string, center: LatLng, radiusKm: number): Promise<Place[]> {
  const { tmap } = getApiConfig();
  const params = new URLSearchParams({
    version: '1',
    searchKeyword: keyword,
    count: '10',
    resCoordType: 'WGS84GEO',
    searchType: 'all',
    searchtypCd: 'R',
    centerLon: String(center.lng),
    centerLat: String(center.lat),
    radius: String(radiusKm),
  });

  const response = await requestJson<TmapPoiResponse>(
    `${tmap.baseUrl}/tmap/pois?${params.toString()}`,
    { method: 'GET', headers: headers() }
  );

  return (response.searchPoiInfo?.pois?.poi ?? []).map(parsePoi);
}

/**
 * 경로 곁에 스치는 가게 한 곳. 없으면 null — 그게 정상이다.
 * TMAP 키가 없으면 조용히 null.
 */
export async function fetchPlaceAlongRoute(path: LatLng[]): Promise<AlongRoutePlace | null> {
  const { tmap } = getApiConfig();
  if (tmap.appKey == null || path.length < 2) {
    return null;
  }

  /*
   * 검색 중심은 **길 위의 한복판**이다.
   *
   * 출발점과 도착점의 중점으로 잡으면 곧은 길에서만 맞는다. 이 앱이 주로 만드는
   * 건 일부러 늘린 길이라 한가운데가 옆으로 크게 부풀어 있어, 그 중점은 사용자가
   * 지나지도 않는 자리다 — 거기서 1km를 뒤지면 정작 걷는 구간이 반경 밖으로 빠지고,
   * 찾아온 가게는 전부 45m 필터에 걸러져 힌트가 조용히 사라진다.
   */
  const center = path[Math.floor(path.length / 2)];

  try {
    const results = await Promise.all(
      QUICK_STOP_CATEGORIES.map((category) =>
        searchNear(category, center, 1).then((places) =>
          places.map((p) => ({ place: p, category }))
        )
      )
    );

    const flat = results.flat();
    const picked = pickAlongRoute(
      path,
      flat.map((r) => r.place)
    );
    if (picked == null) {
      return null;
    }

    // 고른 곳이 어느 범주로 검색됐는지 되찾아 문구에 쓴다.
    const category =
      flat.find((r) => r.place.name === picked.name)?.category ?? QUICK_STOP_CATEGORIES[0];
    return { ...picked, category };
  } catch {
    return null;
  }
}

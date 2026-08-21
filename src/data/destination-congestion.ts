/**
 * 목적지 혼잡도.
 *
 * TMAP Puzzle 장소 혼잡도는 대형 쇼핑시설 200여 곳만 다룬다. 그래서 경로의
 * 한적함(`quiet`)에는 쓸 수 없고 — 그건 서울 실시간 인구데이터가 맡는다 —
 * **약속 장소가 마침 그런 곳일 때** 도착 화면에서 한 줄 얹는 용도로 쓴다.
 *
 *   "5분 남았어요. 롯데월드몰, 지금 붐벼요."
 *
 * 목록에 없는 장소가 대부분이므로, 없으면 조용히 아무것도 안 보여준다.
 */

import {
  fetchCongestionPlaces,
  fetchPlaceCongestion,
  type CongestionPlace,
  type PlaceCongestion,
} from './tmap/congestion';
import type { Place } from './tmap/parse';

/** 이름 비교용 정규화. 공백·괄호·점 때문에 안 맞는 걸 막는다. */
export function normalizeName(name: string): string {
  return name.replace(/[\s()·・.,-]/g, '').toLowerCase();
}

/**
 * 목적지가 혼잡도 제공 장소인지 찾는다.
 *
 * poiId가 있으면 그걸로 맞춘다(검색으로 고른 장소). 지오코딩 결과처럼 poiId가
 * 없으면 이름으로 맞춘다 — "롯데월드몰"과 "롯데월드몰 "을 같게 보려면 정규화가 필요하다.
 */
export function matchCongestionPlace(
  destination: Place,
  places: CongestionPlace[]
): CongestionPlace | null {
  if (destination.poiId != null && destination.poiId !== '') {
    const byId = places.find((p) => p.poiId === destination.poiId);
    if (byId != null) {
      return byId;
    }
  }

  const target = normalizeName(destination.name);
  if (target === '') {
    return null;
  }
  return places.find((p) => normalizeName(p.poiName) === target) ?? null;
}

/** 제공 장소 목록은 자주 안 바뀐다. 세션 동안 한 번만 받는다. */
let placeCache: CongestionPlace[] | null = null;

export function clearCongestionPlaceCache(): void {
  placeCache = null;
}

async function loadPlaces(): Promise<CongestionPlace[]> {
  if (placeCache != null) {
    return placeCache;
  }
  const { places } = await fetchCongestionPlaces(0, 1000);
  placeCache = places;
  return places;
}

export interface DestinationCongestion extends PlaceCongestion {
  poiName: string;
}

/**
 * 목적지의 지금 혼잡도. 제공 장소가 아니거나 조회에 실패하면 null.
 * 도착 화면의 부가 정보라 실패가 흐름을 막아선 안 된다.
 */
export async function lookupDestinationCongestion(
  destination: Place | null
): Promise<DestinationCongestion | null> {
  if (destination == null) {
    return null;
  }

  try {
    const places = await loadPlaces();
    const match = matchCongestionPlace(destination, places);
    if (match == null) {
      return null;
    }

    const congestion = await fetchPlaceCongestion(match.poiId);
    return congestion == null ? null : { ...congestion, poiName: match.poiName };
  } catch {
    return null;
  }
}

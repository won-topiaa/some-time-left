/**
 * 목적지 찾기.
 *
 * 장소 이름은 POI 검색이, 주소는 지오코딩이 잘한다. 둘 다 TMAP이고
 * 같은 appKey를 쓴다 — 사용자가 "성수동 어니언"을 치든 "테헤란로 152"를 치든
 * 하나만 물어보고 실패하지 않도록 입력 모양을 보고 둘을 섞는다.
 */

import { searchPlaces } from './tmap/client';
import { geocodeAddress } from './tmap/geocode';
import { isTmapConfigured } from '../config';
import { SEOUL_HOTSPOTS } from './seoul/hotspots';
import { distanceM } from '../domain/geo';
import type { Place } from './tmap/parse';
import type { LatLng } from '../domain/types';

export type { Place };

/** 키 없이 돌 때 검색에 보여줄 최대 개수. */
const MOCK_LIMIT = 8;

/**
 * 키 없이 도는 화면용 목적지.
 *
 * TMAP 키가 없으면 장소 검색이 통째로 막혀서, 목적지를 못 고르고 그러면 첫 화면
 * 밖으로 나갈 수가 없었다 — 경로는 mock으로 떨어지게 해 뒀는데 정작 그 mock까지
 * 가는 문이 잠겨 있던 셈이다. 그래서 혼잡도용으로 이미 갖고 있는 서울 121곳의
 * 실좌표(`SEOUL_HOTSPOTS`)를 목적지로 빌려 준다. 좌표가 진짜라 골라서 걷기까지
 * 이어지고, 지도에도 현재 위치에서 그 지점까지 실제 경로가 그려진다.
 *
 * 키가 있으면 findPlaces가 이 함수를 부르지 않는다 — 그때는 진짜 검색이 답한다.
 */
function mockPlaces(query: string, near?: LatLng): Place[] {
  const needle = query.toLowerCase();
  const matched = SEOUL_HOTSPOTS.filter((spot) => spot.areaName.toLowerCase().includes(needle));

  // 현재 위치를 알면 가까운 곳부터. 모르면 목록 순서(가나다)를 그대로 둔다.
  const ordered =
    near == null
      ? matched
      : [...matched].sort((a, b) => distanceM(near, a.at) - distanceM(near, b.at));

  return ordered.slice(0, MOCK_LIMIT).map((spot) => ({
    name: spot.areaName,
    address: '',
    at: spot.at,
  }));
}

/** "테헤란로 152", "역삼동 737" 처럼 주소로 보이는 입력인가. */
export function looksLikeAddress(query: string): boolean {
  return /(로|길|동|가)\s*\d|\d+-\d+|\d+번지/.test(query);
}

export async function findPlaces(query: string, near?: LatLng): Promise<Place[]> {
  const trimmed = query.trim();
  if (trimmed === '') {
    return [];
  }

  // 키가 없으면 진짜 검색이 없다. 빈 목록을 돌려주면 목적지를 못 골라 첫 화면에
  // 갇히므로, 실좌표를 가진 mock 목적지로 대신한다. 앱을 눌러볼 수는 있어야 한다.
  if (!isTmapConfigured()) {
    return mockPlaces(trimmed, near);
  }

  const lookups: Promise<Place[]>[] = [searchPlaces(trimmed, near).catch(() => [])];

  // 여기까지 왔으면 키가 있는 것이다(위에서 걸렀다). 주소꼴이면 지오코딩도 함께.
  if (looksLikeAddress(trimmed)) {
    lookups.push(geocodeAddress(trimmed).catch(() => []));
  }

  const results = await Promise.all(lookups);
  return dedupe(results.flat());
}

/** 같은 장소가 두 소스에서 겹쳐 오는 걸 정리한다. */
function dedupe(places: Place[]): Place[] {
  const seen = new Set<string>();
  return places.filter((place) => {
    const key = `${place.name}|${place.at.lat.toFixed(5)},${place.at.lng.toFixed(5)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

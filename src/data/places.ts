/**
 * 목적지 찾기.
 *
 * 장소 이름은 POI 검색이, 주소는 지오코딩이 잘한다. 둘 다 TMAP이고
 * 같은 appKey를 쓴다 — 사용자가 "성수동 어니언"을 치든 "테헤란로 152"를 치든
 * 하나만 물어보고 실패하지 않도록 입력 모양을 보고 둘을 섞는다.
 */

import { searchPlaces } from './tmap/client';
import { geocodeAddress } from './tmap/geocode';
import { searchOsmPlaces } from './osm-places';
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
 * 이제는 마지막 안전망이다. 키가 없어도 OSM 검색이 먼저 답하고, 그마저 못 읽는
 * 날(오프라인)에만 이 목록이 받는다 — 어느 날이든 목적지는 고를 수 있어야 한다.
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

  // 키가 없어도 검색은 진짜여야 한다. 핫스팟 121곳만으로는 중앙대학교도 흑석역도
  // "없는 곳"이 된다 — 실제로 그랬다. OSM(Photon)은 키 없이 열려 있고 역·대학·
  // 도로명 주소를 안다. 그마저 못 읽으면 실좌표 목록으로 물러난다.
  if (!isTmapConfigured()) {
    const osm = await searchOsmPlaces(trimmed, near).catch(() => []);
    return osm.length > 0 ? dedupe(osm) : mockPlaces(trimmed, near);
  }

  const lookups: Promise<Place[]>[] = [searchPlaces(trimmed, near).catch(() => [])];

  // 여기까지 왔으면 키가 있는 것이다(위에서 걸렀다). 주소꼴이면 지오코딩도 함께.
  if (looksLikeAddress(trimmed)) {
    lookups.push(geocodeAddress(trimmed).catch(() => []));
  }

  const results = await Promise.all(lookups);
  const found = dedupe(results.flat());
  if (found.length > 0) {
    return found;
  }

  // TMAP이 빈손으로 돌아온 이름도 있다. OSM은 다른 지도라 다른 이름을 안다 —
  // 마지막으로 한 번 더 물어본다. 여기도 비면 정말 없는 것이다.
  return dedupe(await searchOsmPlaces(trimmed, near).catch(() => []));
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

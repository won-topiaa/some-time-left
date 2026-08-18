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
import type { Place } from './tmap/parse';
import type { LatLng } from '../domain/types';

export type { Place };

/** "테헤란로 152", "역삼동 737" 처럼 주소로 보이는 입력인가. */
export function looksLikeAddress(query: string): boolean {
  return /(로|길|동|가)\s*\d|\d+-\d+|\d+번지/.test(query);
}

export async function findPlaces(query: string, near?: LatLng): Promise<Place[]> {
  const trimmed = query.trim();
  if (trimmed === '') {
    return [];
  }

  const lookups: Promise<Place[]>[] = [searchPlaces(trimmed, near).catch(() => [])];

  if (looksLikeAddress(trimmed) && isTmapConfigured()) {
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

/**
 * 목적지 찾기.
 *
 * 장소 이름은 TMAP POI 검색이, 주소는 네이버 지오코딩이 잘한다.
 * 둘 다 붙여두고 입력이 주소처럼 보이면 네이버를 함께 부른다.
 */

import { searchPlaces } from './tmap/client';
import { geocodeAddress, isNaverConfigured } from './naver/geocode';
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

  if (looksLikeAddress(trimmed) && isNaverConfigured()) {
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

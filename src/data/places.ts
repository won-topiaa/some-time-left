/**
 * 목적지 찾기.
 *
 * 세 층이다. 아래일수록 믿을 수 있고 위일수록 많이 안다.
 *
 *   오프라인  전국 행정구역 색인(`regions/`) + 서울 핫스팟 122곳.
 *            네트워크 없이 답한다. **"지역"은 언제나 여기서 찾아진다.**
 *   OSM      Photon. 키 없이 역·대학·가게를 안다. 남의 무료 서버라 SLA가 없다.
 *   TMAP     키가 있을 때. 한국 POI를 가장 잘 알고, 주소는 지오코딩이 받는다.
 *
 * 있는 층을 전부 물어 하나로 세운다. 출처가 무엇이든 정확히 맞는 이름이 앞이고,
 * 현재 위치를 알면 가까운 것이 앞이다.
 *
 * ## 오프라인 층이 생긴 이유
 *
 * 사용자가 "흑석동"을 쳤는데 "찾는 곳이 없어요"가 떴다. 그때 키 없는 번들의
 * 검색은 Photon → 핫스팟 순이었는데, Photon은 이 저장소에서 한 번도 실측된 적이
 * 없었고(컨테이너에서 막혀 있었다) 핫스팟 122곳엔 동 이름이 사실상 없었다.
 * 경로 버그와 같은 종류다 — 검증 안 된 외부 의존 하나에 기대고, 그게 빠지면
 * 바닥이 없다. 바닥은 번들 안에 있어야 한다.
 */

import { searchPlaces } from './tmap/client';
import { geocodeAddress } from './tmap/geocode';
import { searchOsmPlaces } from './osm-places';
import { fold, matchRank, searchRegions } from './regions/search';
import { isTmapConfigured } from '../config';
import { SEOUL_HOTSPOTS } from './seoul/hotspots';
import { distanceM } from '../domain/geo';
import type { Place } from './tmap/parse';
import type { LatLng } from '../domain/types';

export type { Place };

/** 한 번에 돌려줄 최대 개수. 검색 결과 상자가 화면을 덮지 않게. */
const LIMIT = 8;

/**
 * 오프라인 결과가 이미 손에 있을 때 온라인을 기다려 주는 시간 (ms).
 *
 * 오프라인이 빈손이면 온라인 응답을 끝까지(요청 타임아웃) 기다린다 — 그게 유일한
 * 희망이니까. 그런데 "흑석동"처럼 오프라인이 이미 답한 입력에서 죽은 Photon을
 * 7초씩 기다리면, 답을 손에 쥐고도 화면은 "찾는 중..."이다. 그때는 짧게만 기다린다.
 */
const ONLINE_GRACE_MS = 2500;

/**
 * 서울 핫스팟. 혼잡도용으로 이미 갖고 있는 실좌표 122곳(역·공원·번화가)을
 * 목적지로도 빌려 쓴다. 이름은 citydata API의 AREA_NM 그대로다.
 */
function hotspotPlaces(query: string): Place[] {
  const needle = fold(query);
  return SEOUL_HOTSPOTS.filter((spot) => fold(spot.areaName).includes(needle)).map((spot) => ({
    name: spot.areaName,
    address: '',
    at: spot.at,
  }));
}

/** 네트워크 없이 답하는 것 전부. */
function offlinePlaces(query: string, near?: LatLng): Place[] {
  return dedupe([...searchRegions(query, near), ...hotspotPlaces(query)]);
}

/** "테헤란로 152", "역삼동 737" 처럼 주소로 보이는 입력인가. */
export function looksLikeAddress(query: string): boolean {
  return /(로|길|동|가)\s*\d|\d+-\d+|\d+번지/.test(query);
}

/**
 * 오래 걸리면 빈손으로 돌아온다. 실패도 빈손이다 — 검색이 한 출처 때문에 통째로
 * 죽을 이유는 없다.
 */
async function withinGrace(lookup: Promise<Place[]>, graceMs: number): Promise<Place[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<Place[]>((resolve) => {
    timer = setTimeout(() => resolve([]), graceMs);
  });
  try {
    return await Promise.race([lookup.catch(() => [] as Place[]), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

export async function findPlaces(query: string, near?: LatLng): Promise<Place[]> {
  const trimmed = query.trim();
  if (trimmed === '') {
    return [];
  }

  // 바닥부터. 이건 실패할 수 없다.
  const offline = offlinePlaces(trimmed, near);
  // 이미 답이 있으면 온라인은 잠깐만 기다린다. 없으면 끝까지 기다린다.
  const grace = offline.length > 0 ? ONLINE_GRACE_MS : Number.POSITIVE_INFINITY;
  const wait = (lookup: Promise<Place[]>) =>
    Number.isFinite(grace) ? withinGrace(lookup, grace) : lookup.catch(() => [] as Place[]);

  let online: Place[];
  if (!isTmapConfigured()) {
    online = await wait(searchOsmPlaces(trimmed, near));
  } else {
    const lookups = [wait(searchPlaces(trimmed, near))];
    // 주소꼴이면 지오코딩도 함께. 같은 키를 쓴다.
    if (looksLikeAddress(trimmed)) {
      lookups.push(wait(geocodeAddress(trimmed)));
    }
    online = (await Promise.all(lookups)).flat();
    // TMAP이 빈손이면 OSM에 한 번 더. 두 지도는 서로 모르는 이름을 안다.
    if (online.length === 0) {
      online = await wait(searchOsmPlaces(trimmed, near));
    }
  }

  return rankPlaces(trimmed, dedupe([...offline, ...online]), near).slice(0, LIMIT);
}

/**
 * 출처를 가리지 않고 한 줄로 세운다: 잘 맞는 이름 → 가까운 곳 → 짧은 이름.
 *
 * 온라인 결과는 그쪽 나름의 순서(TMAP은 인기순, Photon은 관련도순)로 오는데,
 * 그걸 그대로 오프라인 결과 뒤에 붙이면 "흑석동"을 쳤을 때 TMAP이 준
 * '흑석동주민센터'가 정작 흑석동보다 위에 서기도 한다. 하나의 잣대로 다시 센다.
 * 잣대를 못 대는 것(이름에 검색어가 없는 온라인 결과 — 별칭·영문명 히트)은
 * 맨 뒤에 원래 순서대로 둔다.
 */
function rankPlaces(query: string, places: Place[], near?: LatLng): Place[] {
  const needle = fold(query);
  return places
    .map((place, index) => ({ place, index, rank: matchRank(needle, place.name) ?? 3 }))
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      if (a.rank === 3) return a.index - b.index;
      if (near != null) {
        const da = distanceM(near, a.place.at);
        const db = distanceM(near, b.place.at);
        if (da !== db) return da - db;
      }
      return a.place.name.length - b.place.name.length;
    })
    .map(({ place }) => place);
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

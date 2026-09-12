/**
 * 목적지 찾기.
 *
 * 세 층이다. 아래일수록 믿을 수 있고 위일수록 많이 안다.
 *
 *   오프라인  전국 행정구역 색인(`regions/`) + 전국 역 색인(`stations/`)
 *            + 서울 핫스팟 121곳. 네트워크 없이 답한다.
 *            **"지역"과 "역"은 언제나 여기서 찾아진다.**
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
import { fold, searchRegions } from './regions/search';
import { rankStation, searchStations } from './stations/search';
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

/**
 * 네트워크 없이 답하는 것 전부.
 *
 * 역 이름은 역 색인이 받는다. 핫스팟 121곳 중 41곳이 역 색인과 이름이 겹치는데,
 * 두 좌표는 같은 역을 가리키면서도 조금씩 다르다 — 핫스팟 좌표는 혼잡도를 재는
 * '지점'이고 역 색인은 OSM의 역 노드다. 걸어갈 자리는 뒤엣것이다.
 *
 * **`dedupe`에 맡기면 안 된다.** 그건 300m 안에서만 같은 곳으로 보므로, 서울역
 * (301m)·수유역(341m)·용산역(355m)·구로디지털단지역(502m)은 둘 다 살아남아
 * 같은 이름 두 줄이 나란히 뜬다. 부제가 없는 핫스팟 줄이 위에 서기도 하고,
 * 그걸 누르면 역에서 300~500m 떨어진 측정 지점으로 걸어간다 — 3분을 계산하는
 * 앱에서 4~7분치 오차다. 그래서 거리와 무관하게 이름으로 걸러 낸다.
 *
 * 혼잡도는 이것과 무관하게 붙는다 — `seoul/congestion.ts`가 좌표에서 700m 반경의
 * 핫스팟을 따로 찾으므로, 여기서 목록에서 빼도 그 역의 혼잡도는 그대로 재진다.
 */
function offlinePlaces(query: string, near?: LatLng): Place[] {
  const stations = searchStations(query, near);
  const stationNames = new Set(stations.map((place) => fold(place.name)));

  return dedupe([
    ...searchRegions(query, near),
    ...stations,
    ...hotspotPlaces(query).filter((place) => !stationNames.has(fold(place.name))),
  ]);
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

  /*
   * 유예는 **온라인 전체에 한 덩어리**다. 호출마다 새로 주면 TMAP이 유예를 다
   * 태우고 빈손일 때 OSM 뒷배가 유예를 또 받아, "잠깐만 기다린다"던 화면이
   * 두 배(5초)를 돈다 — 답을 손에 쥐고서. 시계 하나로 재고, 남은 게 없으면
   * 다음 시도는 아예 안 한다(요청만 나가고 결과는 못 쓰는 셈이니까).
   */
  const startedAt = Date.now();
  const remaining = () =>
    offline.length > 0
      ? Math.max(0, ONLINE_GRACE_MS - (Date.now() - startedAt))
      : Number.POSITIVE_INFINITY;
  const wait = (lookup: Promise<Place[]>) => {
    const grace = remaining();
    return Number.isFinite(grace) ? withinGrace(lookup, grace) : lookup.catch(() => [] as Place[]);
  };

  /*
   * **있는 층을 전부 동시에 묻는다.** 이 파일 첫머리가 그렇게 하겠다고 적어 둔 일이다.
   *
   * 예전엔 OSM을 TMAP이 **정확히 빈손일 때만** 물었다. 그래서 TMAP이 엉뚱한
   * 한 건이라도 주면 OSM은 아예 안 물었고, 두 지도가 서로 모르는 이름을 안다는
   * 바로 그 사실을 쓰지 못했다 — osm-places.ts의 주석이 그걸 이유로 적고 있는데도.
   *
   * 나란히 묻는 것이 더 느리지도 않다. 유예는 온라인 전체에 한 덩어리이고
   * (`remaining()`), 셋이 같은 시계를 나눠 쓰며 병렬로 기다린다.
   */
  const lookups: Array<Promise<Place[]>> = [wait(searchOsmPlaces(trimmed, near))];
  if (isTmapConfigured()) {
    lookups.push(wait(searchPlaces(trimmed, near)));
    // 주소꼴이면 지오코딩도 함께. 같은 키를 쓴다.
    if (looksLikeAddress(trimmed)) {
      lookups.push(wait(geocodeAddress(trimmed)));
    }
  }
  const online: Place[] = (await Promise.all(lookups)).flat();

  // 어느 줄이 번들에서 온 것인지 그대로 들고 간다. `dedupe`는 걸러낼 뿐이라
  // 객체가 그대로 남으므로, 순서가 아니라 정체로 구별할 수 있다.
  return rankPlaces(trimmed, dedupe([...offline, ...online]), near, new Set(offline)).slice(
    0,
    LIMIT
  );
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
function rankPlaces(
  query: string,
  places: Place[],
  near?: LatLng,
  offline: ReadonlySet<Place> = new Set()
): Place[] {
  const needle = fold(query);
  return places
    .map((place, index) => ({
      place,
      index,
      /*
       * 잣대는 역 모듈과 **같은 것**을 쓴다.
       *
       * 예전엔 `matchRank`를 그대로 썼다. 그런데 역 색인은 양쪽의 '역'을 떼고
       * 한 번 더 보는 잣대로 1순위를 올려 보내는데, 여기서 다른 잣대로 다시
       * 세우면 그 역이 뒤로 밀린다. 실제로 부산 서면에 서서 "서면"을 치면
       * 눈앞의 서면역이 rank 1이 되어 이름이 정확히 '서면'인 읍면 여덟 곳에
       * 8칸을 다 내주고 화면에서 사라졌다. "이수역"의 총신대입구(이수)역도
       * 같은 이유로 "잣대를 못 대는 것"(rank 3) 통에 들어갔다.
       */
      rank: rankStation(needle, fold(place.name)) ?? 3,
      /*
       * 잣대가 같고 거리도 같으면 번들 안의 것이 먼저다.
       *
       * 번들 안의 줄은 **그 장소 자체**(역·동)이고, 온라인 결과는 대개 그
       * 주변의 것이다. 같은 급으로 맞았는데 어느 쪽을 위에 둘지 정해야 한다면,
       * 지어낼 수 없는 쪽을 위에 둔다.
       *
       * **이것만으로 해결되지 않는 경우가 있다.** "이수역"을 쳤을 때 TMAP이
       * '이수역1번출구'처럼 검색어로 **시작하는** 이름 여덟 줄을 주면, 그들은
       * rank 1이고 145m 옆의 총신대입구(이수)역은 rank 2라 여덟 칸이 먼저 찬다.
       * 접두 일치가 부분 일치보다 잘 맞는 것은 맞는 판정이므로 여기서 뒤집지
       * 않았다 — 그 여덟 줄도 같은 환승역 출구라 걸어갈 자리는 다르지 않다.
       */
      fromBundle: offline.has(place) ? 0 : 1,
      // 거리는 여기서 한 번만. 비교자 안에서 재면 정렬이 하버사인을 n log n 번 다시 돈다
      // — regions/search.ts가 정확히 이 이유로 미리 재 둔다. 같은 규칙이다.
      distance: near == null ? 0 : distanceM(near, place.at),
    }))
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      if (a.rank === 3) return a.index - b.index;
      if (a.fromBundle !== b.fromBundle) return a.fromBundle - b.fromBundle;
      if (a.distance !== b.distance) return a.distance - b.distance;
      return a.place.name.length - b.place.name.length;
    })
    .map(({ place }) => place);
}

/**
 * 같은 장소가 이 안이면 하나로 본다 (m).
 *
 * 오프라인 색인의 흑석동과 Photon의 흑석동은 같은 동네인데 중심점이 몇십 m
 * 다르다. 좌표를 자릿수로 뭉쳐 비교하면 그 차이가 그대로 남아, "흑석동"을 치면
 * 흑석동이 두 줄 나란히 뜬다 — 같은 이름이 이 거리 안에 있으면 먼저 온 쪽
 * (오프라인이 앞이라 상위 구역 주소가 붙은 쪽)만 남긴다. 다른 도시의 같은 이름
 * (중앙동 238쌍)은 이보다 한참 멀어 둘 다 살아남는다.
 */
const SAME_PLACE_M = 300;

/** 같은 장소가 두 소스에서 겹쳐 오는 걸 정리한다. */
function dedupe(places: Place[]): Place[] {
  const seenByName = new Map<string, LatLng[]>();
  return places.filter((place) => {
    const key = fold(place.name);
    const kept = seenByName.get(key);
    if (kept != null && kept.some((at) => distanceM(at, place.at) < SAME_PLACE_M)) {
      return false;
    }
    if (kept == null) {
      seenByName.set(key, [place.at]);
    } else {
      kept.push(place.at);
    }
    return true;
  });
}

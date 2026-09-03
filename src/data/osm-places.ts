/**
 * 키 없는 장소 검색 — Photon (OSM 지오코더).
 *
 * TMAP 키가 없는 번들에서 검색이 서울 핫스팟 121곳뿐이면, 중앙대학교도 흑석역도
 * "없는 곳"이 된다. Photon은 OSM 데이터를 그대로 쓰는 공개 지오코더라 키도 등록도
 * 없이 역·대학·가게·도로명 주소를 찾고, 타이핑 중 검색(typeahead)을 명시적으로
 * 허용한다 — 같은 OSM 계열이라도 Nominatim은 자동완성을 금지해서 여기 못 쓴다.
 *
 * TMAP이 있는 날에도 빈손으로 돌아오면 한 번 더 물어보는 뒷배로 쓴다.
 * 두 지도는 서로 모르는 이름을 알고 있다.
 */

import { getApiConfig } from '../config';
import { requestJson } from './http';
import type { Place } from './tmap/parse';
import type { LatLng } from '../domain/types';

/** 한 번에 보여줄 최대 개수. 화면의 결과 상자가 스크롤 없이 담는 만큼. */
const LIMIT = 8;

interface PhotonFeature {
  geometry?: { coordinates?: unknown };
  properties?: Record<string, unknown>;
}

interface PhotonResponse {
  features?: PhotonFeature[];
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Photon 응답 → 우리 Place. 순수 함수.
 *
 * - 한국 밖은 버린다. 산책 앱에 시드니의 같은 이름 카페를 내밀 일이 없다.
 * - 이름이 없는 결과(순수 주소 히트)는 "흑석로 84"처럼 도로명+번호를 이름으로 쓴다.
 * - 주소는 큰 데서 작은 데로 — "서울 동작구 흑석로 84". 결과 줄 밑에 작게 붙는다.
 */
export function parsePhotonPlaces(response: PhotonResponse): Place[] {
  const places: Place[] = [];

  for (const feature of response.features ?? []) {
    const props = feature.properties ?? {};
    const coords = feature.geometry?.coordinates;

    if (
      !Array.isArray(coords) ||
      typeof coords[0] !== 'number' ||
      typeof coords[1] !== 'number' ||
      !Number.isFinite(coords[0]) ||
      !Number.isFinite(coords[1])
    ) {
      continue;
    }
    if (asText(props.countrycode).toUpperCase() !== 'KR') {
      continue;
    }

    const streetLine = [asText(props.street), asText(props.housenumber)]
      .filter((part) => part !== '')
      .join(' ');
    const name = asText(props.name) !== '' ? asText(props.name) : streetLine;
    if (name === '') {
      continue;
    }

    const address = [asText(props.city) || asText(props.state), asText(props.district), streetLine]
      .filter((part) => part !== '' && part !== name)
      .join(' ');

    // GeoJSON은 [경도, 위도] 순서다. 뒤집으면 바다 위의 목적지가 된다.
    places.push({ name, address, at: { lat: coords[1], lng: coords[0] } });
  }

  return places.slice(0, LIMIT);
}

/** 현재 위치를 알면 그 근처부터 나온다 — 약속 장소는 대개 근처다. */
export async function searchOsmPlaces(query: string, near?: LatLng): Promise<Place[]> {
  const { osmSearch } = getApiConfig();

  /*
   * lang 파라미터는 **넣지 않는다.** photon.komoot.io는 색인에 넣은 언어
   * (default·en·de·fr)만 받고 그 밖의 값에는 400을 던진다 — 'ko'를 넣는 순간
   * 모든 검색이 조용히(.catch) 빈손이 되어, 키 없는 번들의 POI 검색이 통째로
   * 죽는다. 한국 장소의 기본 이름은 어차피 한글이라 default로 충분하다.
   */
  const params = new URLSearchParams({ q: query, limit: String(LIMIT) });
  if (near != null) {
    params.set('lat', near.lat.toFixed(6));
    params.set('lon', near.lng.toFixed(6));
  }

  const response = await requestJson<PhotonResponse>(`${osmSearch.baseUrl}/api?${params}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      // 공개 OSM 서비스들은 누가 부르는지 밝히길 요구한다(FOSSGIS는 없으면 403).
      'User-Agent': osmSearch.userAgent,
    },
  });

  return parsePhotonPlaces(response);
}

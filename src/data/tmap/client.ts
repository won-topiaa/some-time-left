import { getApiConfig } from '../../config';
import { requestJson } from '../http';
import type { LatLng } from '../../domain/types';
import { parsePedestrianResponse, parsePoi, toPassList, type ParsedRoute, type Place } from './parse';
import type {
  TmapPedestrianRequest,
  TmapPedestrianResponse,
  TmapPoiResponse,
  TmapSearchOption,
} from './types';

function headers(): Record<string, string> {
  const { tmap } = getApiConfig();
  const base: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  // 자체 프록시를 쓰면 키는 서버가 붙인다.
  if (tmap.appKey != null) {
    base.appKey = tmap.appKey;
  }
  return base;
}

export interface PedestrianQuery {
  origin: LatLng;
  destination: LatLng;
  originName?: string;
  destinationName?: string;
  waypoints?: LatLng[];
  searchOption?: TmapSearchOption;
  /** 이 요청만 짧게 끊는다. 없으면 설정의 기본값 — 후보용이다. */
  timeoutMs?: number;
}

/** 보행자 경로안내. 경유지를 넣으면 그만큼 돌아가는 경로가 나온다. */
export async function fetchPedestrianRoute({
  origin,
  destination,
  originName = '출발',
  destinationName = '도착',
  waypoints = [],
  searchOption = '0',
  timeoutMs,
}: PedestrianQuery): Promise<ParsedRoute> {
  const { tmap } = getApiConfig();

  const body: TmapPedestrianRequest = {
    startX: origin.lng,
    startY: origin.lat,
    endX: destination.lng,
    endY: destination.lat,
    // TMAP은 이름을 URL 인코딩해서 받는다.
    startName: encodeURIComponent(originName),
    endName: encodeURIComponent(destinationName),
    searchOption,
    reqCoordType: 'WGS84GEO',
    resCoordType: 'WGS84GEO',
  };

  if (waypoints.length > 0) {
    body.passList = toPassList(waypoints);
  }

  const response = await requestJson<TmapPedestrianResponse>(
    `${tmap.baseUrl}/tmap/routes/pedestrian?version=1`,
    { method: 'POST', headers: headers(), body: JSON.stringify(body) },
    timeoutMs
  );

  return parsePedestrianResponse(response);
}

/** 장소 이름으로 목적지 찾기. "성수동 어니언" 같은 입력을 좌표로 바꾼다. */
export async function searchPlaces(keyword: string, near?: LatLng): Promise<Place[]> {
  const { tmap } = getApiConfig();

  const params = new URLSearchParams({
    version: '1',
    searchKeyword: keyword,
    count: '8',
    resCoordType: 'WGS84GEO',
    searchType: 'all',
  });

  /*
   * 현재 위치는 **순서를 위해서만** 넘긴다. 걸러내라고 넘기지 않는다.
   *
   * 예전엔 `searchtypCd: 'R'`과 `radius: '10'`을 같이 보냈다. 주석에는
   * "가까운 곳부터 나온다"라고 적혀 있었지만 반경 검색은 **가까운 것만 남긴다** —
   * 순서가 아니라 배제다. 그래서 이 층만 아는 이름(예: 봉천역)을 치면 결과가
   * 통째로 비었고, 화면은 "찾는 곳이 없어요"를 내놨다.
   *
   * 같은 키·같은 엔드포인트인데 `npm run check-config`의 검색은 결과를 받아
   * 왔다는 것이 단서였다. 그 호출에는 이 세 줄이 없다.
   *
   * 거리로 앞세우는 일은 우리가 이미 한다 — `places.ts`의 `rankPlaces`가
   * 이름 일치 → 거리 → 짧은 이름으로 다시 세운다. 그러니 공급자에게 걸러 달라고
   * 할 이유가 없고, 걸러 달라고 하면 그 층이 아는 것까지 잃는다.
   *
   * `reqCoordType`은 **보내는 좌표가 무엇인지** 밝히는 값이다. 안 밝히고 좌표를
   * 보내면 기본값이 무엇이냐에 따라 엉뚱한 자리를 가리킬 수 있다 — 이 파일의
   * 경로 호출은 처음부터 이걸 밝히고 있었는데(위의 `reqCoordType: 'WGS84GEO'`),
   * 검색 호출만 빠져 있었다.
   */
  if (near != null) {
    params.set('reqCoordType', 'WGS84GEO');
    params.set('centerLon', String(near.lng));
    params.set('centerLat', String(near.lat));
  }

  const response = await requestJson<TmapPoiResponse>(
    `${tmap.baseUrl}/tmap/pois?${params.toString()}`,
    { method: 'GET', headers: headers() }
  );

  return (response.searchPoiInfo?.pois?.poi ?? []).map(parsePoi);
}

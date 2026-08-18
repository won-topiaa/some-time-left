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
}

/** 보행자 경로안내. 경유지를 넣으면 그만큼 돌아가는 경로가 나온다. */
export async function fetchPedestrianRoute({
  origin,
  destination,
  originName = '출발',
  destinationName = '도착',
  waypoints = [],
  searchOption = '0',
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
    { method: 'POST', headers: headers(), body: JSON.stringify(body) }
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

  // 현재 위치를 넘기면 가까운 곳부터 나온다. 약속 장소는 대개 근처다.
  if (near != null) {
    params.set('centerLon', String(near.lng));
    params.set('centerLat', String(near.lat));
    params.set('searchtypCd', 'R');
    params.set('radius', '10');
  }

  const response = await requestJson<TmapPoiResponse>(
    `${tmap.baseUrl}/tmap/pois?${params.toString()}`,
    { method: 'GET', headers: headers() }
  );

  return (response.searchPoiInfo?.pois?.poi ?? []).map(parsePoi);
}

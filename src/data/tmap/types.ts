/**
 * TMAP 보행자 경로안내 응답 타입.
 * https://apis.openapi.sk.com/tmap/routes/pedestrian
 *
 * 응답은 GeoJSON FeatureCollection이다. Point 피처는 안내 지점(횡단보도, 계단 등),
 * LineString 피처는 실제로 걷는 선분이다.
 */

export interface TmapPointGeometry {
  type: 'Point';
  coordinates: [number, number];
}

export interface TmapLineStringGeometry {
  type: 'LineString';
  coordinates: [number, number][];
}

export type TmapGeometry = TmapPointGeometry | TmapLineStringGeometry;

export interface TmapFeatureProperties {
  /** 전체 거리 (m). 첫 Point 피처에만 들어 있다. */
  totalDistance?: number;
  /** 전체 소요 시간 (초). 첫 Point 피처에만 들어 있다. */
  totalTime?: number;
  /** 구간 거리 (m) */
  distance?: number;
  /** 구간 소요 시간 (초) */
  time?: number;
  /** "횡단보도 후 직진" 같은 안내 문구 */
  description?: string;
  /** 안내 지점 종류. SP 출발, EP 도착, GP 안내 */
  pointType?: string;
  /** 도로 종류. 보행자 경로에서 계단/육교 등을 구분한다. */
  facilityType?: string;
  facilityName?: string;
  /** 회전 종류 코드 */
  turnType?: number;
}

export interface TmapFeature {
  type: 'Feature';
  geometry: TmapGeometry;
  properties: TmapFeatureProperties;
}

export interface TmapPedestrianResponse {
  type: 'FeatureCollection';
  features: TmapFeature[];
}

/** 보행자 경로 탐색 옵션. 0=추천, 4=대로우선, 10=최단, 30=계단제외 */
export type TmapSearchOption = '0' | '4' | '10' | '30';

export interface TmapPedestrianRequest {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  startName: string;
  endName: string;
  /** 경유지. "경도,위도_경도,위도" 형식, 최대 5개 */
  passList?: string;
  searchOption?: TmapSearchOption;
  reqCoordType: 'WGS84GEO';
  resCoordType: 'WGS84GEO';
}

export interface TmapPoi {
  /** POI ID. 혼잡도 데이터가 있는 장소인지 대조할 때 쓴다. */
  id?: string;
  name: string;
  /** 중심 좌표 */
  noorLat: string;
  noorLon: string;
  /** 입구 좌표 — 도보 목적지로는 이쪽이 더 정확하다 */
  frontLat: string;
  frontLon: string;
  upperAddrName?: string;
  middleAddrName?: string;
  lowerAddrName?: string;
  roadName?: string;
}

export interface TmapPoiResponse {
  searchPoiInfo?: {
    pois?: {
      poi?: TmapPoi[];
    };
  };
}

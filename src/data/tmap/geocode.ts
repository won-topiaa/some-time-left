/**
 * TMAP 지오코딩 (주소 → 좌표).
 *
 * 네이버를 걷어내고 이쪽으로 옮겼다. 장소 검색·경로와 같은 appKey를 쓰므로
 * 키가 하나 줄고, 벤더가 하나로 통일된다.
 *
 * 엔드포인트 존재는 확인했다(`INVALID_API_KEY` 응답 — 없는 경로는
 * `MISSING_AUTHENTICATION_TOKEN`이 온다). 응답 필드 구조는 유효한 키가 없어
 * 실측하지 못했으므로, 파서는 알려진 두 형태를 모두 받도록 방어적으로 썼다.
 */

import { getApiConfig } from '../../config';
import { requestJson } from '../http';
import type { Place } from './parse';

interface CoordinateRow {
  /** 도로명 주소로 매칭됐을 때의 좌표 */
  newLat?: string;
  newLon?: string;
  /** 지번 주소로 매칭됐을 때의 좌표 */
  lat?: string;
  lon?: string;

  city_do?: string;
  gu_gun?: string;
  eup_myun?: string;
  legalDong?: string;
  adminDong?: string;
  ri?: string;
  bunji?: string;
  roadName?: string;
  buildingIndex?: string;
  buildingName?: string;
  zipCode?: string;
}

interface FullAddrGeoResponse {
  coordinateInfo?: {
    coordinate?: CoordinateRow[];
  };
}

/**
 * 도로명으로 매칭되면 newLat/newLon에, 지번으로 매칭되면 lat/lon에 값이 실린다.
 * 둘 다 빈 문자열로 오는 행이 섞이므로 유효한 쪽을 골라야 한다.
 */
function pickCoordinate(row: CoordinateRow): { lat: number; lng: number } | null {
  const candidates: [unknown, unknown][] = [
    [row.newLat, row.newLon],
    [row.lat, row.lon],
  ];

  for (const [rawLat, rawLng] of candidates) {
    const lat = Number(rawLat);
    const lng = Number(rawLng);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) {
      return { lat, lng };
    }
  }
  return null;
}

function addressOf(row: CoordinateRow): string {
  const jibun = [row.city_do, row.gu_gun, row.legalDong ?? row.eup_myun, row.ri, row.bunji];
  const road = [row.city_do, row.gu_gun, row.roadName, row.buildingIndex];

  // 도로명이 있으면 그쪽이 읽기 좋다.
  const parts = row.roadName != null && row.roadName !== '' ? road : jibun;
  return parts.filter((p) => p != null && p !== '').join(' ');
}

export function parseFullAddrGeo(response: FullAddrGeoResponse): Place[] {
  const rows = response.coordinateInfo?.coordinate ?? [];

  return rows.flatMap((row) => {
    const at = pickCoordinate(row);
    if (at == null) {
      return [];
    }
    const address = addressOf(row);
    const name = row.buildingName != null && row.buildingName !== '' ? row.buildingName : address;

    return [{ name, address, at }];
  });
}

/** 전체 주소 문자열 하나로 좌표를 찾는다. "서울시 강남구 테헤란로 152" 같은 입력. */
export async function geocodeAddress(query: string): Promise<Place[]> {
  const { tmap } = getApiConfig();

  const params = new URLSearchParams({
    version: '1',
    fullAddr: query,
    coordType: 'WGS84GEO',
  });

  const headers: Record<string, string> = { Accept: 'application/json' };
  // 자체 프록시를 쓰면 키는 서버가 붙인다.
  if (tmap.appKey != null) {
    headers.appKey = tmap.appKey;
  }

  const response = await requestJson<FullAddrGeoResponse>(
    `${tmap.baseUrl}/tmap/geo/fullAddrGeo?${params.toString()}`,
    { method: 'GET', headers }
  );

  return parseFullAddrGeo(response);
}

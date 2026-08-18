/**
 * 네이버 지오코딩 (주소 → 좌표).
 *
 * 네이버 클라우드 플랫폼 Maps는 Directions 5/15를 제공하지만 **자동차 전용**이고
 * 보행자 경로는 아직 공개되지 않았다. 그래서 도보 경로는 TMAP을 쓰고,
 * 네이버는 주소 해석에만 쓴다 — 도로명·지번 주소는 네이버 쪽이 정확하다.
 *
 * 장소 이름("성수동 어니언")은 지오코딩이 아니라 POI 검색이 필요하므로
 * TMAP POI 검색(`searchPlaces`)이 담당한다.
 */

import { getApiConfig } from '../../config';
import { requestJson } from '../http';
import type { Place } from '../tmap/parse';

interface NaverGeocodeAddress {
  roadAddress: string;
  jibunAddress: string;
  /** 경도 (문자열) */
  x: string;
  /** 위도 (문자열) */
  y: string;
}

interface NaverGeocodeResponse {
  status: string;
  addresses?: NaverGeocodeAddress[];
}

export function isNaverConfigured(): boolean {
  const { naver } = getApiConfig();
  return naver.keyId != null && naver.key != null;
}

export async function geocodeAddress(query: string): Promise<Place[]> {
  const { naver } = getApiConfig();

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (naver.keyId != null && naver.key != null) {
    headers['x-ncp-apigw-api-key-id'] = naver.keyId;
    headers['x-ncp-apigw-api-key'] = naver.key;
  }

  const response = await requestJson<NaverGeocodeResponse>(
    `${naver.baseUrl}/map-geocode/v2/geocode?query=${encodeURIComponent(query)}`,
    { method: 'GET', headers }
  );

  return (response.addresses ?? []).map((address) => ({
    name: address.roadAddress || address.jibunAddress,
    address: address.jibunAddress || address.roadAddress,
    at: { lat: Number(address.y), lng: Number(address.x) },
  }));
}

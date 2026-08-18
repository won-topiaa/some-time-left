/**
 * 브이월드 건물 레이어 (공간 질의).
 *
 * 왜 건축물대장이 아니라 여기서 높이를 얻는가:
 * 건축물대장 API는 시군구코드·법정동코드·번·지로 조회한다. **좌표로는 못 찾는다.**
 * 경로 하나에 건물이 수백 채인데 좌표마다 역지오코딩을 돌려 대장을 부르는 건
 * 현실적이지 않다. 그래서 공간 질의가 되는 브이월드로 한 번에 긁고,
 * 건축물대장은 특정 주소를 정밀하게 볼 때만 쓴다(`ledger.ts`).
 *
 * 레이어 아이디와 층수 속성명은 설정값이다 — 브이월드 레이어 목록에서 확인해 맞출 것.
 */

import { getApiConfig } from '../../config';
import { requestJson } from '../http';
import type { LatLng } from '../../domain/types';
import { heightFromFloors, type Building } from './types';

interface VWorldFeature {
  geometry?: {
    type?: string;
    coordinates?: unknown;
  };
  properties?: Record<string, unknown>;
}

interface VWorldResponse {
  response?: {
    status?: string;
    result?: {
      featureCollection?: {
        features?: VWorldFeature[];
      };
    };
  };
}

/** 폴리곤이든 점이든 대표 좌표 하나를 뽑는다. */
function representativePoint(coordinates: unknown): LatLng | null {
  if (!Array.isArray(coordinates)) {
    return null;
  }
  // [lng, lat] 까지 내려갈 때까지 첫 원소를 따라 내려간다.
  let node: unknown = coordinates;
  while (Array.isArray(node) && Array.isArray(node[0])) {
    node = node[0];
  }
  if (
    Array.isArray(node) &&
    typeof node[0] === 'number' &&
    typeof node[1] === 'number'
  ) {
    return { lat: node[1], lng: node[0] };
  }
  return null;
}

export function parseVWorldBuildings(
  response: VWorldResponse,
  floorField: string
): Building[] {
  const features = response.response?.result?.featureCollection?.features ?? [];

  return features.flatMap((feature) => {
    const at = representativePoint(feature.geometry?.coordinates);
    if (at == null) {
      return [];
    }
    const floors = Number(feature.properties?.[floorField]);
    if (!Number.isFinite(floors) || floors <= 0) {
      return [];
    }
    return [{ at, floors, heightM: heightFromFloors(floors) }];
  });
}

export interface BoundingBox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

export function boundingBoxOf(path: LatLng[], paddingDeg = 0.002): BoundingBox | null {
  if (path.length === 0) {
    return null;
  }
  const box = path.reduce<BoundingBox>(
    (acc, p) => ({
      minLat: Math.min(acc.minLat, p.lat),
      maxLat: Math.max(acc.maxLat, p.lat),
      minLng: Math.min(acc.minLng, p.lng),
      maxLng: Math.max(acc.maxLng, p.lng),
    }),
    { minLat: Infinity, maxLat: -Infinity, minLng: Infinity, maxLng: -Infinity }
  );

  return {
    minLat: box.minLat - paddingDeg,
    maxLat: box.maxLat + paddingDeg,
    minLng: box.minLng - paddingDeg,
    maxLng: box.maxLng + paddingDeg,
  };
}

export async function fetchBuildings(path: LatLng[]): Promise<Building[]> {
  const { vworld } = getApiConfig();
  const box = boundingBoxOf(path);

  if (vworld.key == null || box == null) {
    return [];
  }

  const params = new URLSearchParams({
    service: 'data',
    request: 'GetFeature',
    data: vworld.buildingLayer,
    key: vworld.key,
    // 등록 도메인. 모바일은 Referer가 없어 이 값으로 인증한다. 없으면 도메인 오류.
    domain: vworld.domain,
    format: 'json',
    geometry: 'true',
    size: '1000',
    // 브이월드는 BOX(minx, miny, maxx, maxy) — 경도가 먼저다.
    geomFilter: `BOX(${box.minLng},${box.minLat},${box.maxLng},${box.maxLat})`,
  });

  const response = await requestJson<VWorldResponse>(
    `${vworld.baseUrl}?${params.toString()}`,
    { method: 'GET' }
  );

  return parseVWorldBuildings(response, vworld.floorField);
}

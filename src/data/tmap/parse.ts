/**
 * TMAP 응답 → 우리 도메인 타입.
 *
 * 네트워크와 분리된 순수 함수로 둔다. 응답 형태가 이 앱에서 가장 자주 깨질 지점이라
 * 고정된 샘플로 테스트할 수 있어야 한다.
 */

import { bearingDeg, distanceM } from '../../domain/geo';
import type { LatLng, StreetSegment } from '../../domain/types';
import type { TmapFeature, TmapPedestrianResponse, TmapPoi } from './types';

export interface ParsedRoute {
  /** 걷는 선분을 이어 붙인 좌표열 */
  path: LatLng[];
  /** 전체 거리 (m) */
  distanceM: number;
  /** 전체 소요 시간 (초) — TMAP이 계산한 값 */
  durationSec: number;
  /** 횡단보도 개수. 많을수록 생각이 자주 끊긴다. */
  crossings: number;
  /** 계단·육교 개수. 오르내림의 대리 지표. */
  stairs: number;
}

/** TMAP 좌표는 [경도, 위도] 순서다. 뒤집으면 지구 반대편으로 간다. */
function toLatLng([lng, lat]: [number, number]): LatLng {
  return { lat, lng };
}

function isCrossing(feature: TmapFeature): boolean {
  const { description = '', facilityName = '' } = feature.properties;
  return description.includes('횡단보도') || facilityName.includes('횡단보도');
}

function isStairs(feature: TmapFeature): boolean {
  const { description = '', facilityName = '' } = feature.properties;
  return (
    description.includes('계단') ||
    facilityName.includes('계단') ||
    facilityName.includes('육교')
  );
}

export function parsePedestrianResponse(response: TmapPedestrianResponse): ParsedRoute {
  const features = response.features ?? [];

  const path: LatLng[] = [];
  let crossings = 0;
  let stairs = 0;
  let distance = 0;
  let duration = 0;
  let summarySeen = false;

  for (const feature of features) {
    const { properties, geometry } = feature;

    // 총계는 출발 지점 피처에 한 번만 실려 온다.
    if (!summarySeen && properties.totalTime != null) {
      distance = properties.totalDistance ?? 0;
      duration = properties.totalTime;
      summarySeen = true;
    }

    if (isCrossing(feature)) {
      crossings += 1;
    }
    if (isStairs(feature)) {
      stairs += 1;
    }

    if (geometry.type === 'LineString') {
      for (const coordinate of geometry.coordinates) {
        const point = toLatLng(coordinate);
        const previous = path[path.length - 1];
        // 구간 경계에서 같은 점이 중복으로 들어온다.
        if (previous == null || previous.lat !== point.lat || previous.lng !== point.lng) {
          path.push(point);
        }
      }
    }
  }

  // 총계가 없으면 좌표열로 직접 계산한다.
  if (!summarySeen) {
    for (let i = 1; i < path.length; i += 1) {
      distance += distanceM(path[i - 1], path[i]);
    }
    duration = Math.round(distance / 1.25);
  }

  return { path, distanceM: distance, durationSec: duration, crossings, stairs };
}

/**
 * 좌표열 → 그늘 계산용 구간.
 *
 * 방위각과 길이는 실제 경로에서 나온 값이다.
 * 도로 폭과 건물 높이는 아직 외부 데이터가 없어 기본값을 쓴다 —
 * 건축물대장과 도로망 데이터를 붙이면 이 함수만 바꾸면 된다.
 */
export interface StreetProfile {
  widthM: number;
  leftHeightM: number;
  rightHeightM: number;
}

export const DEFAULT_STREET_PROFILE: StreetProfile = {
  widthM: 12,
  leftHeightM: 15,
  rightHeightM: 15,
};

export function toStreetSegments(
  path: LatLng[],
  profileAt: (index: number) => StreetProfile = () => DEFAULT_STREET_PROFILE
): StreetSegment[] {
  const segments: StreetSegment[] = [];

  for (let i = 1; i < path.length; i += 1) {
    const length = distanceM(path[i - 1], path[i]);
    // 0에 가까운 구간은 방위각이 의미 없다.
    if (length < 1) {
      continue;
    }
    const profile = profileAt(i - 1);
    segments.push({
      bearingDeg: bearingDeg(path[i - 1], path[i]),
      lengthM: length,
      widthM: profile.widthM,
      leftHeightM: profile.leftHeightM,
      rightHeightM: profile.rightHeightM,
    });
  }
  return segments;
}

export interface Place {
  name: string;
  address: string;
  at: LatLng;
  /** TMAP POI ID. 검색으로 고른 장소에만 있다(지오코딩 결과에는 없다). */
  poiId?: string;
}

export function parsePoi(poi: TmapPoi): Place {
  // 입구 좌표가 있으면 그쪽이 도보 목적지로 정확하다.
  const lat = Number(poi.frontLat) || Number(poi.noorLat);
  const lng = Number(poi.frontLon) || Number(poi.noorLon);

  const address = [poi.upperAddrName, poi.middleAddrName, poi.lowerAddrName, poi.roadName]
    .filter((part) => part != null && part !== '')
    .join(' ');

  return {
    name: poi.name,
    address,
    at: { lat, lng },
    ...(poi.id != null && poi.id !== '' ? { poiId: poi.id } : {}),
  };
}

/** 경유지 파라미터 형식: "경도,위도_경도,위도" (최대 5개) */
export const MAX_PASS_POINTS = 5;

export function toPassList(waypoints: LatLng[]): string {
  return waypoints
    .slice(0, MAX_PASS_POINTS)
    .map((w) => `${w.lng},${w.lat}`)
    .join('_');
}

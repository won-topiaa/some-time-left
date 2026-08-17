import type { LatLng } from './types';

const EARTH_RADIUS_M = 6371008.8;
const DEG = Math.PI / 180;

/** 두 좌표 사이 거리 (m). Haversine. */
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * DEG;
  const dLng = (b.lng - a.lng) * DEG;
  const lat1 = a.lat * DEG;
  const lat2 = b.lat * DEG;

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** a에서 b를 향하는 방위각 (도, 북=0, 시계방향). */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const lat1 = a.lat * DEG;
  const lat2 = b.lat * DEG;
  const dLng = (b.lng - a.lng) * DEG;

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  return (((Math.atan2(y, x) * 180) / Math.PI) % 360 + 360) % 360;
}

/** 경로 전체 길이 (m). */
export function pathLengthM(path: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    total += distanceM(path[i - 1], path[i]);
  }
  return total;
}

/** 경로 위에서 현재 위치에 가장 가까운 지점 이후의 남은 거리 (m). */
export function remainingDistanceM(path: LatLng[], current: LatLng): number {
  if (path.length === 0) {
    return 0;
  }

  let nearestIndex = 0;
  let nearestDistance = Infinity;
  for (let i = 0; i < path.length; i += 1) {
    const d = distanceM(path[i], current);
    if (d < nearestDistance) {
      nearestDistance = d;
      nearestIndex = i;
    }
  }

  let remaining = distanceM(current, path[nearestIndex]);
  for (let i = nearestIndex + 1; i < path.length; i += 1) {
    remaining += distanceM(path[i - 1], path[i]);
  }
  return remaining;
}

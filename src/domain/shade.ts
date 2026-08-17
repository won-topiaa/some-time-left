/**
 * 그늘길 계산.
 *
 * 원리는 단순하다. 높이 H인 건물은 태양 고도 h일 때 길이 L = H / tan(h) 의
 * 그림자를 드리운다. 그 그림자가 "길을 가로지르는" 성분만이 보행자에게 그늘이 된다.
 * 길과 나란한 방향으로 뻗은 그림자는 아무 소용이 없다.
 *
 *   가로 성분 = L × |sin(태양 방위각 − 도로 방위각)|
 *   그늘 비율 = clamp(가로 성분 / 도로 폭, 0, 1)
 *
 * 그림자를 드리우는 쪽은 항상 "해가 있는 쪽"의 건물이다.
 */

import { signedAngleDiff, solarPosition, type SolarPosition } from './sun';
import type { LatLng, StreetSegment } from './types';

/** 이 고도 밑으로는 그림자가 사실상 길 전체를 덮는다. */
const LOW_SUN_ALTITUDE_DEG = 3;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * 한 구간의 그늘 비율 (0~1).
 * 해가 졌거나 아주 낮으면 1 (그늘 여부를 따질 필요가 없음).
 */
export function segmentShade(segment: StreetSegment, sun: SolarPosition): number {
  if (sun.altitudeDeg <= LOW_SUN_ALTITUDE_DEG) {
    return 1;
  }

  // 진행 방향 기준 태양의 상대 각도. 양수면 오른쪽, 음수면 왼쪽에 해가 있다.
  const relative = signedAngleDiff(sun.azimuthDeg, segment.bearingDeg);
  const sunOnRight = Math.sin(relative * (Math.PI / 180)) > 0;

  // 해가 있는 쪽 건물이 그림자를 드리운다.
  const casterHeightM = sunOnRight ? segment.rightHeightM : segment.leftHeightM;
  if (casterHeightM <= 0) {
    return 0;
  }

  const shadowLengthM = casterHeightM / Math.tan(sun.altitudeDeg * (Math.PI / 180));
  const crossStreetM = shadowLengthM * Math.abs(Math.sin(relative * (Math.PI / 180)));

  return clamp01(crossStreetM / Math.max(1, segment.widthM));
}

/**
 * 경로 전체의 그늘 비율. 구간 길이로 가중 평균한다.
 * 짧은 골목 하나가 전체 평가를 흔들지 않도록.
 */
export function routeShade(segments: StreetSegment[], sun: SolarPosition): number {
  const totalLength = segments.reduce((acc, s) => acc + s.lengthM, 0);
  if (totalLength <= 0) {
    return 0;
  }
  const weighted = segments.reduce(
    (acc, s) => acc + segmentShade(s, sun) * s.lengthM,
    0
  );
  return clamp01(weighted / totalLength);
}

/**
 * 걷는 동안 해가 움직이는 것까지 반영한 그늘 비율.
 * 20~40분을 걷는 앱이므로 출발 시각 한 점으로 계산하면 늦은 오후에 특히 틀린다.
 * 구간을 지나는 예상 시각마다 태양 위치를 다시 구한다.
 */
export function routeShadeOverTime(
  segments: StreetSegment[],
  origin: LatLng,
  startMs: number,
  totalDurationSec: number
): number {
  const totalLength = segments.reduce((acc, s) => acc + s.lengthM, 0);
  if (totalLength <= 0) {
    return 0;
  }

  let travelledM = 0;
  let weighted = 0;

  for (const segment of segments) {
    // 구간 중간 지점을 지나는 시각
    const midRatio = (travelledM + segment.lengthM / 2) / totalLength;
    const atMs = startMs + midRatio * totalDurationSec * 1000;
    const sun = solarPosition(new Date(atMs), origin.lat, origin.lng);

    weighted += segmentShade(segment, sun) * segment.lengthM;
    travelledM += segment.lengthM;
  }

  return clamp01(weighted / totalLength);
}

/**
 * 지금 이 자리에서 그늘을 따질 만한 상황인가.
 * 한여름 한낮이면 어떤 기분을 고르든 그늘 가중치를 얹기 위한 판단.
 */
export function isShadeWorthy(atMs: number, at: LatLng): boolean {
  const sun = solarPosition(new Date(atMs), at.lat, at.lng);
  const month = new Date(atMs).getUTCMonth() + 1; // 대략적인 계절 판단이면 충분
  const warmSeason = month >= 5 && month <= 9;
  return warmSeason && sun.altitudeDeg >= 35;
}

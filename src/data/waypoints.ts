/**
 * 우회 경유지 생성.
 *
 * "정확히 T분 걸리면서 점수가 최대인 경로"는 Arc Orienteering Problem이고 NP-hard다.
 * 대신 훨씬 싼 방법을 쓴다 — 최단 경로 양옆으로 경유지를 하나 찍어서 길을 늘리고,
 * 실제 소요 시간은 도보 API가 알려준 값으로 랭킹한다.
 *
 * 경유지를 옆으로 d만큼 밀면 경로 길이는 대략 2 * sqrt((L/2)^2 + d^2) 가 된다.
 * 목표 길이 T를 넣고 d에 대해 풀면 초기 추정값이 닫힌 형태로 나온다.
 */

import { bearingDeg, distanceM, interpolate, offsetPoint } from '../domain/geo';
import type { LatLng } from '../domain/types';

const DEG = Math.PI / 180;

/**
 * 직선 거리 `directM`인 구간을 `targetM`까지 늘리려면
 * 중간 지점을 옆으로 얼마나 밀어야 하는가 (m).
 */
export function offsetForTargetDistance(directM: number, targetM: number): number {
  if (targetM <= directM) {
    return 0;
  }
  return Math.sqrt((targetM / 2) ** 2 - (directM / 2) ** 2);
}

/**
 * 출발–도착 선분 위 `alongRatio` 지점에서 수직으로 `offsetM`만큼 벗어난 경유지.
 * `offsetM`이 음수면 반대쪽으로 벌어진다.
 */
export function perpendicularWaypoint(
  origin: LatLng,
  destination: LatLng,
  alongRatio: number,
  offsetM: number
): LatLng {
  const base = interpolate(origin, destination, alongRatio);
  const perpendicular = (bearingDeg(origin, destination) + 90) * DEG;

  return offsetPoint(
    base,
    offsetM * Math.sin(perpendicular),
    offsetM * Math.cos(perpendicular)
  );
}

export interface WaypointPlanOptions {
  origin: LatLng;
  destination: LatLng;
  /** 이만큼 걸리는 경로를 원한다 (초) */
  targetSec: number;
  /** 보행 속도 (m/s) */
  speedMps: number;
  /** 만들 후보 개수 */
  count?: number;
  /** 이전 시도의 결과로 보정할 배율 (1이면 보정 없음) */
  scale?: number;
}

/**
 * 후보 경유지 목록. 각 항목이 경로 한 개가 된다.
 *
 * 좌우 양쪽으로, 그리고 선분 위 서로 다른 지점에서 벌린다.
 * 같은 목표 길이라도 벌어지는 위치가 다르면 전혀 다른 동네를 지난다.
 */
export function planWaypoints({
  origin,
  destination,
  targetSec,
  speedMps,
  count = 6,
  scale = 1,
}: WaypointPlanOptions): LatLng[] {
  const directM = distanceM(origin, destination);
  const targetM = targetSec * speedMps;
  const baseOffset = offsetForTargetDistance(directM, targetM) * scale;

  if (baseOffset <= 0) {
    return [];
  }

  // 선분 위 어디서 벌릴지 × 얼마나 벌릴지의 조합
  const alongRatios = [0.5, 0.35, 0.65];
  const magnitudes = [1, 0.85, 1.15];

  const waypoints: LatLng[] = [];
  for (let i = 0; i < count; i += 1) {
    const side = i % 2 === 0 ? 1 : -1;
    const alongRatio = alongRatios[Math.floor(i / 2) % alongRatios.length];
    const magnitude = magnitudes[Math.floor(i / 2) % magnitudes.length];

    waypoints.push(
      perpendicularWaypoint(origin, destination, alongRatio, baseOffset * magnitude * side)
    );
  }
  return waypoints;
}

/**
 * 실제로 돌아온 소요 시간을 보고 다음 시도의 배율을 정한다.
 * 도로망은 직선이 아니라서 첫 추정이 빗나가는 게 정상이다.
 */
export function refineScale(
  achievedSec: number,
  targetSec: number,
  previousScale: number
): number {
  if (achievedSec <= 0) {
    return previousScale;
  }
  const ratio = targetSec / achievedSec;
  // 한 번에 크게 흔들리지 않도록 절반만 반영하고 범위를 제한한다.
  const next = previousScale * (1 + (ratio - 1) * 0.5);
  return Math.min(3, Math.max(0.3, next));
}

/**
 * 경치 점수.
 *
 * 공원과 물가에 얼마나 가까이, 얼마나 오래 붙어 걷는지로 본다.
 * "공원을 지나는 5분"이 "공원 옆을 스치는 10초"보다 훨씬 크게 쳐져야 하므로
 * 좌표 단위로 점수를 매기고 평균한다.
 */

import { distanceM } from '../../domain/geo';
import type { LatLng } from '../../domain/types';
import type { Park } from './client';

/** 이 거리 안이면 공원 곁을 걷는 것으로 본다 (m). */
const NEAR_M = 150;

/** 이 거리를 넘으면 공원이 있으나 마나다 (m). */
const FAR_M = 400;

/** 이 면적이면 충분히 큰 공원으로 본다 (m^2). 큰 공원일수록 체감이 크다. */
const BIG_PARK_M2 = 100000;

/** 물가는 조금 더 쳐준다. */
const WATERFRONT_BONUS = 1.25;

/** 값을 모를 때. */
export const NEUTRAL_SCENIC = 0.5;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** 거리에 따른 감쇠. NEAR 안쪽은 1, FAR 밖은 0, 그 사이는 선형. */
function proximity(distance: number): number {
  if (distance <= NEAR_M) {
    return 1;
  }
  if (distance >= FAR_M) {
    return 0;
  }
  return (FAR_M - distance) / (FAR_M - NEAR_M);
}

/** 면적 보정. 작은 쌈지공원과 한강공원을 같게 치면 안 된다. */
function sizeWeight(areaM2: number): number {
  if (areaM2 <= 0) {
    return 0.5;
  }
  return clamp01(0.4 + 0.6 * Math.min(1, areaM2 / BIG_PARK_M2));
}

export function scoreScenic(path: LatLng[], parks: Park[]): number {
  if (path.length === 0 || parks.length === 0) {
    return NEUTRAL_SCENIC;
  }

  let total = 0;

  for (const point of path) {
    let best = 0;
    for (const park of parks) {
      const near = proximity(distanceM(point, park.at));
      if (near === 0) {
        continue;
      }
      const bonus = park.waterfront ? WATERFRONT_BONUS : 1;
      best = Math.max(best, clamp01(near * sizeWeight(park.areaM2) * bonus));
    }
    total += best;
  }

  return clamp01(total / path.length);
}

/** 경로 주변 공원만 남긴다. 전국 목록을 매번 훑지 않기 위해. */
export function parksNear(parks: Park[], path: LatLng[]): Park[] {
  return parks.filter((park) =>
    path.some((point) => distanceM(point, park.at) <= FAR_M)
  );
}

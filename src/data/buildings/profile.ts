/**
 * 건물 목록 → 도로 단면.
 *
 * 그늘 계산은 구간마다 "왼쪽 건물 높이 / 오른쪽 건물 높이 / 도로 폭"을 요구한다.
 * 건물은 점으로 오므로, 각 구간의 진행 방향을 기준으로 어느 쪽에 있는지 갈라서
 * 가까운 것들의 높이를 취한다.
 */

import { distanceM, signedSideOf } from '../../domain/geo';
import type { LatLng, StreetSegment } from '../../domain/types';
import { DEFAULT_STREET_PROFILE, type StreetProfile } from '../tmap/parse';
import type { Building } from './types';

/** 이 거리 안의 건물만 그 길에 그림자를 드리운다고 본다 (m). */
const INFLUENCE_M = 50;

/** 한쪽에서 높이를 정할 때 참고하는 건물 수. 최고층 하나에 휘둘리지 않도록. */
const SAMPLE_COUNT = 3;

function averageTop(heights: number[]): number {
  if (heights.length === 0) {
    return 0;
  }
  const top = heights.sort((a, b) => b - a).slice(0, SAMPLE_COUNT);
  return top.reduce((acc, h) => acc + h, 0) / top.length;
}

/**
 * 구간 하나의 단면. 건물이 없으면 기본값으로 떨어진다.
 * 도로 폭은 아직 도로망 데이터가 없어 기본값을 쓴다.
 */
export function profileForSegment(
  from: LatLng,
  to: LatLng,
  buildings: Building[]
): StreetProfile {
  const left: number[] = [];
  const right: number[] = [];

  for (const building of buildings) {
    if (distanceM(from, building.at) > INFLUENCE_M + distanceM(from, to)) {
      continue;
    }
    const side = signedSideOf(from, to, building.at);
    if (Math.abs(side.distanceM) > INFLUENCE_M || side.alongRatio < -0.1 || side.alongRatio > 1.1) {
      continue;
    }
    (side.distanceM < 0 ? left : right).push(building.heightM);
  }

  if (left.length === 0 && right.length === 0) {
    return DEFAULT_STREET_PROFILE;
  }

  return {
    widthM: DEFAULT_STREET_PROFILE.widthM,
    leftHeightM: averageTop(left),
    rightHeightM: averageTop(right),
  };
}

/**
 * 경로 좌표열에 대해 구간별 단면을 미리 계산한다.
 * `toStreetSegments(path, profileAt)`에 그대로 넘길 수 있는 콜백을 돌려준다.
 */
export function buildProfileLookup(
  path: LatLng[],
  buildings: Building[]
): (index: number) => StreetProfile {
  if (buildings.length === 0) {
    return () => DEFAULT_STREET_PROFILE;
  }

  const profiles = new Map<number, StreetProfile>();
  for (let i = 1; i < path.length; i += 1) {
    profiles.set(i - 1, profileForSegment(path[i - 1], path[i], buildings));
  }

  return (index: number) => profiles.get(index) ?? DEFAULT_STREET_PROFILE;
}

export type { StreetProfile, StreetSegment };

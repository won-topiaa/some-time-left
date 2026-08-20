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
  buildings: Building[],
  index?: BuildingIndex | null
): StreetProfile {
  const left: number[] = [];
  const right: number[] = [];

  // 구간 길이는 건물마다 달라지지 않는다. 안쪽에서 재면 건물 수만큼 헛계산한다.
  const segmentM = distanceM(from, to);
  const nearby = index != null ? buildingsNear(index, from, to, segmentM) : buildings;

  for (const building of nearby) {
    if (distanceM(from, building.at) > INFLUENCE_M + segmentM) {
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

const METERS_PER_DEG_LAT = 111320;

/** 격자 한 칸의 크기 (m). 영향 반경보다 넉넉히 크게 잡아 칸 수를 줄인다. */
const CELL_M = 100;

/**
 * 건물을 격자에 담아 둔 것.
 *
 * 없으면 구간 하나마다 건물 전부를 훑는다 — 경로 한 개가 수백~천 구간이고
 * 건물은 최대 1000개, 후보는 12개까지 나오니 백만 번 단위의 삼각함수가 된다.
 * Hermes에는 JIT이 없어 그게 그대로 길 찾는 화면의 멈춤이 된다.
 * `features.ts`의 지나온 좌표 격자와 같은 이유, 같은 방식이다.
 */
export interface BuildingIndex {
  cells: Map<string, Building[]>;
  dLat: number;
  dLng: number;
}

function key(latIndex: number, lngIndex: number): string {
  return `${latIndex}:${lngIndex}`;
}

export function buildBuildingIndex(buildings: Building[]): BuildingIndex | null {
  if (buildings.length === 0) {
    return null;
  }

  const dLat = CELL_M / METERS_PER_DEG_LAT;
  const cosLat = Math.cos((buildings[0].at.lat * Math.PI) / 180);
  const dLng = CELL_M / Math.max(1e-6, METERS_PER_DEG_LAT * Math.abs(cosLat));

  const cells = new Map<string, Building[]>();
  for (const b of buildings) {
    const k = key(Math.floor(b.at.lat / dLat), Math.floor(b.at.lng / dLng));
    const bucket = cells.get(k);
    if (bucket == null) {
      cells.set(k, [b]);
    } else {
      bucket.push(b);
    }
  }

  return { cells, dLat, dLng };
}

/**
 * 이 구간에 영향을 줄 수 있는 건물만.
 *
 * 구간을 감싸는 상자를 영향 반경만큼(그리고 `alongRatio`가 ±0.1까지 허용되므로
 * 구간 길이의 10%만큼 더) 넓혀 그 안의 칸만 꺼낸다. 넓게 잡아 거르는 것이라
 * 실제 판정은 아래 조건들이 그대로 하고, 결과는 전부 훑을 때와 같다.
 */
function buildingsNear(
  index: BuildingIndex,
  from: LatLng,
  to: LatLng,
  segmentM: number
): Building[] {
  const marginM = INFLUENCE_M + segmentM * 0.15;
  const marginLat = marginM / METERS_PER_DEG_LAT;
  const cosLat = Math.cos((from.lat * Math.PI) / 180);
  const marginLng = marginM / Math.max(1e-6, METERS_PER_DEG_LAT * Math.abs(cosLat));

  const latFrom = Math.floor((Math.min(from.lat, to.lat) - marginLat) / index.dLat);
  const latTo = Math.floor((Math.max(from.lat, to.lat) + marginLat) / index.dLat);
  const lngFrom = Math.floor((Math.min(from.lng, to.lng) - marginLng) / index.dLng);
  const lngTo = Math.floor((Math.max(from.lng, to.lng) + marginLng) / index.dLng);

  const out: Building[] = [];
  for (let i = latFrom; i <= latTo; i += 1) {
    for (let j = lngFrom; j <= lngTo; j += 1) {
      const bucket = index.cells.get(key(i, j));
      if (bucket != null) {
        out.push(...bucket);
      }
    }
  }
  return out;
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

  // 격자는 경로마다 한 번만 만든다. 구간마다 다시 만들면 쓰는 의미가 없다.
  const index = buildBuildingIndex(buildings);

  const profiles = new Map<number, StreetProfile>();
  for (let i = 1; i < path.length; i += 1) {
    profiles.set(i - 1, profileForSegment(path[i - 1], path[i], buildings, index));
  }

  return (index: number) => profiles.get(index) ?? DEFAULT_STREET_PROFILE;
}

export type { StreetProfile, StreetSegment };

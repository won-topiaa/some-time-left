/**
 * 실제 경로 데이터 → RouteFeatures.
 *
 * 여섯 성질이 각각 어디서 오는지:
 *   unbroken — TMAP 횡단보도 개수
 *   flat     — TMAP 계단·육교 개수 (경사 데이터가 없어 대리 지표)
 *   novelty  — 사용자 본인의 걷기 기록
 *   quiet    — 서울 실시간 인구데이터 (혼잡도)
 *   scenic   — 전국도시공원표준데이터 (공원·수변 근접)
 *   shade    — 태양 위치 × 건물 높이 (브이월드)
 *
 * 외부 데이터가 안 오면 그 성질만 중립값(0.5)으로 떨어진다.
 * 모르는 걸 아는 척하지 않는다.
 */

import { routeShadeOverTime } from '../domain/shade';
import type { LatLng, RouteFeatures, StreetSegment } from '../domain/types';
import { distanceM } from '../domain/geo';
import { scoreQuiet } from './seoul/congestion';
import { scoreScenic } from './parks/scenic';
import { EMPTY_ENVIRONMENT, type Environment } from './environment';

/** 이 밀도를 넘으면 사실상 최악으로 본다 (개/km). */
const CROSSINGS_PER_KM_WORST = 8;
const STAIRS_PER_KM_WORST = 4;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

export interface FeatureInput {
  distanceM: number;
  durationSec: number;
  crossings: number;
  stairs: number;
  path: LatLng[];
  segments: StreetSegment[];
  origin: LatLng;
  departAtMs: number;
  /** 사용자가 예전에 걸었던 경로들의 좌표 */
  previousPaths?: LatLng[][];
  /**
   * 미리 만들어 둔 지나온 좌표 격자.
   * 후보가 여럿일 때 한 번만 만들어 나눠 쓰라고 열어 둔 자리다.
   */
  visitedIndex?: VisitedIndex | null;
  /** 혼잡도·공원·건물. 없으면 해당 성질이 중립값이 된다. */
  environment?: Environment;
}

export function deriveFeatures({
  distanceM: distance,
  durationSec,
  crossings,
  stairs,
  path,
  segments,
  origin,
  departAtMs,
  previousPaths = [],
  visitedIndex,
  environment = EMPTY_ENVIRONMENT,
}: FeatureInput): RouteFeatures {
  const km = Math.max(0.1, distance / 1000);

  return {
    // 횡단보도가 적을수록 생각이 안 끊긴다.
    unbroken: clamp01(1 - crossings / km / CROSSINGS_PER_KM_WORST),
    // 계단이 적을수록 평탄하다고 본다. 진짜 경사는 DEM을 붙여야 한다.
    flat: clamp01(1 - stairs / km / STAIRS_PER_KM_WORST),
    shade: routeShadeOverTime(segments, origin, departAtMs, durationSec),
    novelty: noveltyOf(path, previousPaths, visitedIndex),
    quiet: scoreQuiet(path, environment.congestion),
    scenic: scoreScenic(path, environment.parks),
  };
}

/** 이 반경 안에 지난 기록이 있으면 "가본 곳"으로 친다 (m). */
const VISITED_RADIUS_M = 60;

const METERS_PER_DEG_LAT = 111320;

/**
 * 지나온 좌표들을 60m 격자에 담아 둔 것.
 *
 * 없으면 후보 한 개당 `경로 점 × 지나온 점 전부`를 다 재야 한다. 기록 20개면
 * 지나온 점이 수천 개이고 후보는 12개까지 나오므로 삼각함수 호출이 수백만 번이 된다 —
 * Hermes에는 JIT이 없어 그 계산이 그대로 몇 초짜리 멈춤이 된다.
 * **기록이 쌓일수록 느려지므로, 가장 열심히 쓴 사람이 가장 오래 기다리게 된다.**
 *
 * 격자는 답을 바꾸지 않는다. 반경 밖이 확실한 점을 재지 않을 뿐이다.
 */
export interface VisitedIndex {
  cells: Map<string, LatLng[]>;
  dLat: number;
  dLng: number;
}

function cellKey(latIndex: number, lngIndex: number): string {
  return `${latIndex}:${lngIndex}`;
}

export function buildVisitedIndex(previousPaths: LatLng[][]): VisitedIndex | null {
  const points = previousPaths.flat();
  if (points.length === 0) {
    return null;
  }

  // 격자 한 칸을 반경과 같게 잡으면 이웃 3×3만 봐도 반경 안이 전부 들어온다.
  const dLat = VISITED_RADIUS_M / METERS_PER_DEG_LAT;
  const cosLat = Math.cos((points[0].lat * Math.PI) / 180);
  const dLng = VISITED_RADIUS_M / Math.max(1e-6, METERS_PER_DEG_LAT * Math.abs(cosLat));

  const cells = new Map<string, LatLng[]>();
  for (const p of points) {
    const key = cellKey(Math.floor(p.lat / dLat), Math.floor(p.lng / dLng));
    const bucket = cells.get(key);
    if (bucket == null) {
      cells.set(key, [p]);
    } else {
      bucket.push(p);
    }
  }

  return { cells, dLat, dLng };
}

/** 이 점이 지나온 적 있는 자리인가. 이웃 아홉 칸만 실제로 잰다. */
function wasVisited(point: LatLng, index: VisitedIndex): boolean {
  const latIndex = Math.floor(point.lat / index.dLat);
  const lngIndex = Math.floor(point.lng / index.dLng);

  for (let i = -1; i <= 1; i += 1) {
    for (let j = -1; j <= 1; j += 1) {
      const bucket = index.cells.get(cellKey(latIndex + i, lngIndex + j));
      if (bucket == null) {
        continue;
      }
      for (const v of bucket) {
        if (distanceM(point, v) <= VISITED_RADIUS_M) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * 처음 걷는 길의 비율.
 * 이건 외부 데이터 없이 지금 당장 진짜로 계산된다 — 사용자 본인의 기록이니까.
 *
 * 이미 만들어 둔 격자가 있으면 그걸 쓴다. 후보마다 다시 만들면 격자를 쓰는 의미가 없다.
 */
export function noveltyOf(
  path: LatLng[],
  previousPaths: LatLng[][],
  index?: VisitedIndex | null
): number {
  if (path.length === 0) {
    return 1;
  }

  const visited = index !== undefined ? index : buildVisitedIndex(previousPaths);
  if (visited == null) {
    return 1;
  }

  let fresh = 0;
  for (const point of path) {
    if (!wasVisited(point, visited)) {
      fresh += 1;
    }
  }
  return clamp01(fresh / path.length);
}

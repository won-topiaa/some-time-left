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
  environment = EMPTY_ENVIRONMENT,
}: FeatureInput): RouteFeatures {
  const km = Math.max(0.1, distance / 1000);

  return {
    // 횡단보도가 적을수록 생각이 안 끊긴다.
    unbroken: clamp01(1 - crossings / km / CROSSINGS_PER_KM_WORST),
    // 계단이 적을수록 평탄하다고 본다. 진짜 경사는 DEM을 붙여야 한다.
    flat: clamp01(1 - stairs / km / STAIRS_PER_KM_WORST),
    shade: routeShadeOverTime(segments, origin, departAtMs, durationSec),
    novelty: noveltyOf(path, previousPaths),
    quiet: scoreQuiet(path, environment.congestion),
    scenic: scoreScenic(path, environment.parks),
  };
}

/** 이 반경 안에 지난 기록이 있으면 "가본 곳"으로 친다 (m). */
const VISITED_RADIUS_M = 60;

/**
 * 처음 걷는 길의 비율.
 * 이건 외부 데이터 없이 지금 당장 진짜로 계산된다 — 사용자 본인의 기록이니까.
 */
export function noveltyOf(path: LatLng[], previousPaths: LatLng[][]): number {
  if (path.length === 0) {
    return 1;
  }
  if (previousPaths.length === 0) {
    return 1;
  }

  const visitedPoints = previousPaths.flat();
  if (visitedPoints.length === 0) {
    return 1;
  }

  let fresh = 0;
  for (const point of path) {
    const seen = visitedPoints.some((v) => distanceM(point, v) <= VISITED_RADIUS_M);
    if (!seen) {
      fresh += 1;
    }
  }
  return clamp01(fresh / path.length);
}

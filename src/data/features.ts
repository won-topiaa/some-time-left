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

/** 건물 높이를 못 받았을 때의 그늘. 혼잡도·경치와 같은 규칙이다. */
export const NEUTRAL_SHADE = 0.5;

/**
 * 재보지 못한 성질의 값. "모른다"는 뜻이지 "중간쯤"이라는 뜻이 아니다.
 *
 * 이 값이면 랭킹에서 그 성질로는 앞서지도 뒤처지지도 않는다 — 모르는 것으로
 * 길을 고르지 않겠다는 뜻이다. `NEUTRAL_SHADE`와 같은 규칙을 다른 성질에도 쓴다.
 */
const NEUTRAL = 0.5;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

export interface FeatureInput {
  distanceM: number;
  durationSec: number;
  /** 횡단보도 개수. null이면 재보지 못한 것이라 `unbroken`이 중립값이 된다. */
  crossings: number | null;
  /** 계단·육교 개수. null이면 재보지 못한 것이라 `flat`이 중립값이 된다. */
  stairs: number | null;
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
    /*
     * 횡단보도가 적을수록 생각이 안 끊긴다.
     *
     * 못 받았으면(null) **모르는 것**이라 중립값으로 둔다. 0으로 치면
     * "횡단보도가 하나도 없는 길"이 되어, 신호에 자주 걸리는 길에 대고
     * "생각이 안 끊기는 길이에요"라고 말하게 된다 — 이 파일이 그늘에서
     * 이미 정한 규칙(모르면 중립)을 여기서도 지킨다.
     */
    unbroken:
      crossings == null ? NEUTRAL : clamp01(1 - crossings / km / CROSSINGS_PER_KM_WORST),
    // 계단이 적을수록 평탄하다고 본다. 진짜 경사는 DEM을 붙여야 한다. 모르면 중립.
    flat: stairs == null ? NEUTRAL : clamp01(1 - stairs / km / STAIRS_PER_KM_WORST),
    /*
     * 건물 높이를 하나도 못 받았으면 그늘은 **모르는 것**이다.
     *
     * 못 받으면 모든 구간이 기본 단면(양옆 15m)으로 떨어지는데, 그 상태로 계산하면
     * 남북 길 0.03 / 동서 길 0.36처럼 그럴듯하게 갈린 값이 나온다. 길의 방위는 진짜지만
     * 양옆 벽은 지어낸 것이라, 그 숫자로 길을 고르고 "이 시간엔 그늘이 이어지는
     * 길이에요"라고 말하면 근거 없는 말을 하는 셈이다 — 특히 '햇볕이 싫어요'는
     * 그늘 가중치가 0.6이라 순위가 통째로 지어낸 값에 끌려간다.
     * 이 파일이 처음부터 정한 대로, 모르면 중립값으로 둔다.
     */
    shade:
      environment.buildings.length > 0
        ? routeShadeOverTime(segments, origin, departAtMs, durationSec)
        : NEUTRAL_SHADE,
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

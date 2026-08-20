/**
 * TMAP 보행자 경로안내로 구현한 RouteProvider.
 *
 * 후보를 만드는 방법:
 *  1. 최단 경로를 한 번 부른다 (시간 예산의 기준점)
 *  2. 목표 시간에 맞는 우회 폭을 닫힌 형태로 추정해 경유지를 여러 개 만든다
 *  3. 각 경유지로 경로를 병렬 요청한다
 *  4. 결과가 목표에서 많이 벗어나면 배율을 보정해 한 번 더 시도한다
 *
 * NP-hard인 정식 최적화(Arc Orienteering Problem) 대신,
 * 실제 소요 시간은 TMAP이 알려주고 우리는 랭킹만 한다.
 */

import { buildVisitedIndex, deriveFeatures } from './features';
import { fetchPedestrianRoute } from './tmap/client';
import { toStreetSegments } from './tmap/parse';
import { planWaypoints, refineScale } from './waypoints';
import { EMPTY_ENVIRONMENT, loadEnvironment, type Environment } from './environment';
import { buildProfileLookup } from './buildings/profile';
import type { LatLng, RouteCandidate } from '../domain/types';
import type { RouteProvider, RouteRequest } from './route-provider';
import { DEFAULT_WALK_SPEED_MPS } from '../domain/pace';

/** 보정 재시도를 할지 판단하는 기준 — 목표 대비 이만큼 어긋나면 (초). */
const REFINE_THRESHOLD_SEC = 120;

/** 한 번에 띄우는 후보 개수. TMAP 호출 수와 직결되므로 과하게 늘리지 않는다. */
const CANDIDATE_COUNT = 6;

export class TmapRouteProvider implements RouteProvider {
  /**
   * 최단 경로는 시간 예산을 잡기 위한 것이라 환경 데이터를 부르지 않는다.
   * 여기서까지 외부 API를 때리면 첫 화면이 느려진다.
   */
  async shortest(origin: LatLng, destination: LatLng): Promise<RouteCandidate> {
    const parsed = await fetchPedestrianRoute({ origin, destination });
    const segments = toStreetSegments(parsed.path);

    return {
      id: 'shortest',
      durationSec: parsed.durationSec,
      distanceM: parsed.distanceM,
      path: parsed.path,
      segments,
      features: deriveFeatures({
        ...parsed,
        segments,
        origin,
        departAtMs: Date.now(),
      }),
    };
  }

  async candidates({
    origin,
    destination,
    targetSec,
    departAtMs,
    previousPaths = [],
  }: RouteRequest): Promise<RouteCandidate[]> {
    const build = (scale: number, tag: string) =>
      this.fetchRound({
        origin,
        destination,
        targetSec,
        departAtMs,
        previousPaths,
        scale,
        tag,
      });

    const first = await build(1, 'a');

    // 도로망은 직선이 아니라서 첫 추정은 빗나가는 게 정상이다.
    const best = closestTo(first, targetSec);
    if (best == null || Math.abs(best.durationSec - targetSec) <= REFINE_THRESHOLD_SEC) {
      return first;
    }

    const second = await build(refineScale(best.durationSec, targetSec, 1), 'b').catch(
      () => [] as RouteCandidate[]
    );

    return [...first, ...second];
  }

  private async fetchRound({
    origin,
    destination,
    targetSec,
    departAtMs,
    previousPaths,
    scale,
    tag,
  }: RouteRequest & {
    previousPaths: LatLng[][];
    scale: number;
    tag: string;
  }): Promise<RouteCandidate[]> {
    const waypoints = planWaypoints({
      origin,
      destination,
      targetSec,
      speedMps: DEFAULT_WALK_SPEED_MPS,
      count: CANDIDATE_COUNT,
      scale,
    });

    const results = await Promise.allSettled(
      waypoints.map((waypoint) =>
        fetchPedestrianRoute({ origin, destination, waypoints: [waypoint] })
      )
    );

    // 일부 경유지는 도로망에 안 붙는다. 하나 실패해도 나머지는 살린다.
    const routes = results.flatMap((result, index) =>
      result.status === 'fulfilled' && result.value.path.length >= 2
        ? [{ parsed: result.value, index }]
        : []
    );

    if (routes.length === 0) {
      return [];
    }

    // 후보들이 대개 같은 동네를 지난다. 환경 데이터는 한 번만 받아 나눠 쓴다.
    const environment: Environment = await loadEnvironment(
      routes.map((r) => r.parsed.path)
    ).catch(() => EMPTY_ENVIRONMENT);

    // 지나온 좌표 격자도 후보마다 다시 만들면 안 된다. 여기서 한 번 만들어 나눠 쓴다.
    const visitedIndex = buildVisitedIndex(previousPaths);

    return routes.map(({ parsed, index }) => {
      // 건물 높이가 있으면 그늘 계산이 실제 값으로 바뀐다.
      const segments = toStreetSegments(
        parsed.path,
        buildProfileLookup(parsed.path, environment.buildings)
      );

      return {
        id: `tmap-${tag}-${index}`,
        durationSec: parsed.durationSec,
        distanceM: parsed.distanceM,
        path: parsed.path,
        segments,
        features: deriveFeatures({
          ...parsed,
          segments,
          origin,
          departAtMs,
          previousPaths,
          visitedIndex,
          environment,
        }),
      };
    });
  }
}

function closestTo(candidates: RouteCandidate[], targetSec: number): RouteCandidate | null {
  return candidates.reduce<RouteCandidate | null>((best, candidate) => {
    if (best == null) {
      return candidate;
    }
    return Math.abs(candidate.durationSec - targetSec) <
      Math.abs(best.durationSec - targetSec)
      ? candidate
      : best;
  }, null);
}

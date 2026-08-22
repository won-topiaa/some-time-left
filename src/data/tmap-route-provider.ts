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

/**
 * 목표보다 이만큼 **밑을 겨눈다** (0~1 비율).
 *
 * 정확히 목표를 겨누면 만들어진 길들이 목표 위아래로 흩어지고, 위로 벗어난 절반은
 * 문턱에서 버려진다. 게다가 한쪽으로 쏠린다 — 경유지는 우리가 잡은 보행 속도로
 * 거리를 환산해 찍는데, 도보 API가 알려주는 소요 시간은 대체로 그보다 길게 나온다.
 * 그래서 겨눈 자리보다 위로 몰린다.
 *
 * 조금 밑을 겨누면 흩어진 것들이 목표 아래에 놓인다. 일찍 닿는 건 아쉬운 일이지만
 * 늦는 건 실패라, 어느 쪽으로 치우칠지는 고민할 것이 없다.
 */
const AIM_UNDER_RATIO = 0.05;

/** 짧은 길에서도 겨냥이 의미를 갖도록 하는 최소 폭 (초). */
const AIM_UNDER_MIN_SEC = 45;

/** 후보를 만들 때 실제로 겨누는 시간. */
export function aimSec(targetSec: number): number {
  return Math.max(0, targetSec - Math.max(AIM_UNDER_MIN_SEC, targetSec * AIM_UNDER_RATIO));
}

/** 한 번에 띄우는 후보 개수. TMAP 호출 수와 직결되므로 과하게 늘리지 않는다. */
const CANDIDATE_COUNT = 6;

/**
 * 경로의 정체성으로 만든 id.
 *
 * 자리 번호(`tmap-a-0`)를 쓰면 안 된다. 기록에 남는 routeId가 "최근에 걸은 길
 * 감점"(REPEAT_PENALTY)의 열쇠인데, 자리 번호는 **다른 목적지의 전혀 다른 길**과도
 * 겹친다 — 어제 카페 가는 길의 0번과 오늘 회사 가는 길의 0번이 같은 id가 되어,
 * 걸어 본 적 없는 길이 감점을 받는다.
 *
 * 길 가운데 지점의 좌표를 소수 셋째 자리(±100m 남짓)로 뭉쳐 쓴다. 같은 길이면
 * GPS가 조금 달라도 같은 id가 되고, 다른 동네의 길과는 겹칠 수 없다.
 */
function routeIdOf(path: LatLng[]): string {
  const mid = path[Math.floor(path.length / 2)];
  const end = path[path.length - 1];
  return `tmap-${mid.lat.toFixed(3)},${mid.lng.toFixed(3)}-${end.lat.toFixed(3)},${end.lng.toFixed(3)}`;
}

export class TmapRouteProvider implements RouteProvider {
  /**
   * 최단 경로는 시간 예산을 잡기 위한 것이라 환경 데이터를 부르지 않는다.
   * 여기서까지 외부 API를 때리면 첫 화면이 느려진다.
   */
  async shortest(origin: LatLng, destination: LatLng): Promise<RouteCandidate> {
    const parsed = await fetchPedestrianRoute({ origin, destination });
    const segments = toStreetSegments(parsed.path);

    return {
      // 자리 이름('shortest')이 아니라 정체성이다 — 이 id도 기록에 남아 감점의 열쇠가 된다.
      id: routeIdOf(parsed.path),
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
    // 목표가 아니라 그 조금 밑을 겨눈다. 흩어진 것들이 목표 위로 넘어가지 않도록.
    const aim = aimSec(targetSec);

    const build = (scale: number) =>
      this.fetchRound({
        origin,
        destination,
        targetSec: aim,
        departAtMs,
        previousPaths,
        scale,
      });

    const first = await build(1);

    // 도로망은 직선이 아니라서 첫 추정은 빗나가는 게 정상이다.
    const best = closestTo(first, aim);
    if (best == null || Math.abs(best.durationSec - aim) <= REFINE_THRESHOLD_SEC) {
      return first;
    }

    const second = await build(refineScale(best.durationSec, aim, 1)).catch(
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
  }: RouteRequest & {
    previousPaths: LatLng[][];
    scale: number;
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
    const routes = results.flatMap((result) =>
      result.status === 'fulfilled' && result.value.path.length >= 2
        ? [{ parsed: result.value }]
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

    return routes.map(({ parsed }) => {
      // 건물 높이가 있으면 그늘 계산이 실제 값으로 바뀐다.
      const segments = toStreetSegments(
        parsed.path,
        buildProfileLookup(parsed.path, environment.buildings)
      );

      return {
        id: routeIdOf(parsed.path),
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

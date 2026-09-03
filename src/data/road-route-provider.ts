/**
 * 실제 도로망 위에서 후보를 만드는 공급자.
 *
 * TMAP도 OSRM도 하는 일은 같다 — 좌표 두 점(과 경유지)을 주면 도로를 따라간
 * 좌표열을 돌려준다. 다른 건 부르는 방법뿐이라, 그 한 군데만 갈아 끼우게 두고
 * 나머지는 전부 공유한다.
 *
 * 공유하는 것이 중요한 이유가 있다. 후보를 목표 시간에 맞추는 일은 한 번에
 * 안 된다 — 경유지는 직선 거리로 찍는데 도로는 굽어 있어서 첫 추정이 늘 넘친다.
 * 그래서 빗나가면 배율을 고쳐 한 번 더 부르는 **보정 라운드**가 있다. 이걸
 * 공급자마다 따로 두면 한쪽만 고쳐지고, 보정 없는 쪽은 후보가 전부 목표를
 * 넘겨 "돌아갈 길을 못 찾았어요"로 조용히 물러선다.
 *
 * 후보를 만드는 방법:
 *  1. 최단 경로를 한 번 부른다 (시간 예산의 기준점)
 *  2. 목표 시간에 맞는 우회 폭을 닫힌 형태로 추정해 경유지를 여러 개 만든다
 *  3. 각 경유지로 경로를 병렬 요청한다
 *  4. 결과가 목표에서 많이 벗어나면 배율을 보정해 한 번 더 시도한다
 *
 * NP-hard인 정식 최적화(Arc Orienteering Problem) 대신,
 * 실제 소요 시간은 도로망 API가 알려주고 우리는 랭킹만 한다.
 */

import { buildVisitedIndex, deriveFeatures } from './features';
import { toStreetSegments, type ParsedRoute } from './tmap/parse';
import { planWaypoints, refineScale } from './waypoints';
import { EMPTY_ENVIRONMENT, loadEnvironment, type Environment } from './environment';
import { buildProfileLookup } from './buildings/profile';
import { inspectPath } from '../domain/route-sanity';
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

/** 한 번에 띄우는 후보 개수. 외부 호출 수와 직결되므로 과하게 늘리지 않는다. */
const CANDIDATE_COUNT = 6;

/**
 * 첫 라운드가 통째로 비었을 때 다시 해 볼 배율.
 *
 * 경유지가 하나도 도로망에 안 붙었다는 뜻이므로, 더 멀리가 아니라 **안쪽으로**
 * 당겨 본다. 도로가 성긴 동네에서 옆으로 크게 벌린 점이 전부 허공에 찍힌 경우다.
 */
const EMPTY_ROUND_SCALE = 0.6;

/** 요청 사이에 간격을 둘 때 쓴다. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 도로망에서 좌표열 하나를 받아 오는 방법. 공급자마다 이것만 다르다. */
export type FetchRoadRoute = (query: {
  origin: LatLng;
  destination: LatLng;
  waypoints?: LatLng[];
}) => Promise<ParsedRoute>;

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
 *
 * 접두사는 공급자를 가리킨다. 같은 길이라도 TMAP과 OSRM은 좌표가 조금 달라
 * 섞이면 안 되고, 무엇이 만든 기록인지도 나중에 알아볼 수 있어야 한다.
 */
function routeIdOf(prefix: string, path: LatLng[]): string {
  const mid = path[Math.floor(path.length / 2)];
  const end = path[path.length - 1];
  return `${prefix}-${mid.lat.toFixed(3)},${mid.lng.toFixed(3)}-${end.lat.toFixed(3)},${end.lng.toFixed(3)}`;
}

export interface RoadProviderOptions {
  /** 도로망을 부르는 방법. */
  fetchRoute: FetchRoadRoute;
  /** 기록에 남을 routeId의 접두사. 공급자를 가리킨다. */
  idPrefix: string;
  /**
   * 후보 요청 사이에 두는 간격 (ms). 0이면 한꺼번에 던진다.
   *
   * TMAP은 우리 몫의 할당량을 쓰는 것이라 한꺼번에 던져도 된다. OSRM은 남의
   * 무료 서버(FOSSGIS)이고 정책이 "초당 1회, 과용 금지"다 — 후보 여섯을 동시에
   * 던지면 그 자리에서 정책을 여섯 배로 어긴다. 게다가 거기에 기대는 것이
   * 하필 키 없는 심사용 번들이라, 차단당하면 그 번들만 길을 잃는다.
   */
  requestSpacingMs?: number;
}

export class RoadRouteProvider implements RouteProvider {
  private readonly fetchRoute: FetchRoadRoute;
  private readonly idPrefix: string;
  private readonly requestSpacingMs: number;

  constructor({ fetchRoute, idPrefix, requestSpacingMs = 0 }: RoadProviderOptions) {
    this.fetchRoute = fetchRoute;
    this.idPrefix = idPrefix;
    this.requestSpacingMs = requestSpacingMs;
  }

  /**
   * 최단 경로는 시간 예산을 잡기 위한 것이라 환경 데이터를 부르지 않는다.
   * 여기서까지 외부 API를 때리면 첫 화면이 느려진다.
   */
  async shortest(origin: LatLng, destination: LatLng): Promise<RouteCandidate> {
    const parsed = await this.fetchRoute({ origin, destination });

    /*
     * 여기에도 관문을 둔다.
     *
     * 후보 쪽에는 `path.length >= 2` 검사가 있었는데 최단 쪽에는 없었다. 그래서
     * API가 200과 함께 빈 응답을 주면 점 0개짜리 '경로'가 예외 없이 통과해,
     * 정직한 실패 문구를 건너뛴 채 지도도 없는 "0분 · 0.0km"가 화면에 남았다.
     * 최단은 시간 예산 전체의 기준점이라, 여기가 틀리면 그 위의 모든 약속이 틀린다.
     */
    assertWalkable(parsed, '최단');

    const segments = toStreetSegments(parsed.path);

    return {
      // 자리 이름('shortest')이 아니라 정체성이다 — 이 id도 기록에 남아 감점의 열쇠가 된다.
      id: routeIdOf(this.idPrefix, parsed.path),
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
    if (best != null && Math.abs(best.durationSec - aim) <= REFINE_THRESHOLD_SEC) {
      return first;
    }

    /*
     * 첫 라운드가 통째로 빈 날에도 한 번 더 해 본다.
     *
     * 예전엔 `best == null`이면 그대로 빈손으로 돌아갔다. 경유지가 전부 도로망에
     * 안 붙었다는 뜻이니 더 해 볼 게 없다고 본 것인데, 배율을 줄여 경유지를
     * 안쪽으로 당기면 붙는 날이 있다. 여기서 포기하면 화면은 "돌아갈 길을 못
     * 찾았어요"로 물러선다 — 자투리 시간을 채우는 게 이 앱이 하는 일 전부인데.
     */
    const nextScale = best == null ? EMPTY_ROUND_SCALE : refineScale(best.durationSec, aim, 1);

    const second = await build(nextScale).catch(() => [] as RouteCandidate[]);

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

    /*
     * 간격을 둘 수 있게 시작 시각을 어긋나게 한다. 여전히 병렬로 기다리므로
     * 전체 시간은 (간격 × 개수 + 한 번의 응답 시간) 정도로만 늘어난다 —
     * 길을 기다리는 화면이라 여기서 몇 초씩 더 쓰면 안 된다.
     */
    const results = await Promise.allSettled(
      waypoints.map(async (waypoint, index) => {
        if (this.requestSpacingMs > 0 && index > 0) {
          await delay(this.requestSpacingMs * index);
        }
        return this.fetchRoute({ origin, destination, waypoints: [waypoint] });
      })
    );

    /*
     * 일부 경유지는 도로망에 안 붙는다. 하나 실패해도 나머지는 살린다.
     *
     * 그리고 **성공한 것도 다시 본다.** 응답이 왔다는 것과 걸을 수 있는 길이라는
     * 것은 다른 말이다 — 공급자는 앞으로도 늘어날 것이고, 새로 붙는 쪽이 또
     * 직선을 그어 보낼 수 있다. 관문은 출처를 묻지 않는다.
     */
    const routes = results.flatMap((result) =>
      result.status === 'fulfilled' && inspectPath(result.value.path).ok
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
        id: routeIdOf(this.idPrefix, parsed.path),
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

/**
 * 걸을 수 없는 길이면 던진다.
 *
 * 돌려주지 않고 던지는 이유: 부르는 쪽이 "실패했으니 다른 공급자를 쓰자"거나
 * "사실대로 말하자"를 판단할 수 있어야 한다. 그럴듯한 대용품을 돌려주는 순간
 * 그게 곧 산을 가로지르던 그 버그가 된다.
 */
function assertWalkable(parsed: ParsedRoute, what: string): void {
  const sanity = inspectPath(parsed.path);
  if (!sanity.ok) {
    throw new Error(
      `${what} 경로가 걸을 수 있는 모양이 아니에요 (${sanity.reason})`
    );
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

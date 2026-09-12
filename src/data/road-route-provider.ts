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
import {
  NARROW_SPREAD,
  planWaypoints,
  refineScale,
  waypointMagnitude,
} from './waypoints';
import { EMPTY_ENVIRONMENT, loadEnvironment, type Environment } from './environment';
import { withDeadline } from './deadline';
import { buildBuildingIndex, buildProfileLookup } from './buildings/profile';
import { inspectPath } from '../domain/route-sanity';
import { interpolate } from '../domain/geo';
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
 * 보정 라운드에서 띄우는 개수. 첫 라운드보다 적다.
 *
 * 보정은 이미 답을 하나 손에 쥔 상태에서 **더 가까운 것**을 찾는 일이다. 여기서도
 * 여섯을 던지면 요청도 두 배가 되고, 간격을 두는 공급자에서는 그 간격만큼
 * (250ms × 5 = 1.25초) 화면이 더 기다린다. 넷이면 좌우 두 쌍이라 벌리는 자리는
 * 그대로 다양하고, 기다림은 0.75초로 줄어든다.
 */
const REFINE_COUNT = 4;

/**
 * 환경 데이터를 기다려 주는 최대 시간 (ms).
 *
 * 혼잡도·공원·건물은 **순위를 다듬는** 값이지 길 자체가 아니다. 그런데 라운드마다
 * 그걸 다 받고 나서야 후보가 만들어져서, 외부 API 셋 중 하나만 느려도 길을
 * 기다리는 화면이 그만큼 길어졌다 — 요청 타임아웃이 7초라 최악에는 7초를
 * 통째로 서 있었다.
 *
 * 못 받으면 중립값으로 간다(`EMPTY_ENVIRONMENT`). 그늘과 한적함이 조금 덜 정확한
 * 길과, 7초 더 기다린 뒤에야 나오는 길 중에서는 앞이 낫다.
 */
const ENVIRONMENT_DEADLINE_MS = 1500;

/**
 * 후보 한 건을 기다려 주는 최대 시간 (ms).
 *
 * 후보는 여럿을 동시에 띄워 되는 것만 쓴다. 하나가 응답을 안 주면 나머지 다섯이
 * 이미 와 있어도 라운드 전체가 그 하나를 기다렸다 — 기본 타임아웃이 7초다.
 * 최단 경로는 없으면 아무것도 못 하므로 기본값 그대로 두고, 여기서만 짧게 끊는다.
 */
const CANDIDATE_TIMEOUT_MS = 3500;

/**
 * 첫 라운드가 통째로 비었을 때 다시 해 볼 배율.
 *
 * 경유지가 하나도 도로망에 안 붙었다는 뜻이므로, 더 멀리가 아니라 **안쪽으로**
 * 당겨 본다. 도로가 성긴 동네에서 옆으로 크게 벌린 점이 전부 허공에 찍힌 경우다.
 */
const EMPTY_ROUND_SCALE = 0.6;

/**
 * 받아 온 좌표열 하나와, **그걸 만든 배율**.
 *
 * 배율을 같이 들고 다니는 이유는 보정 라운드다. 1라운드가 배율을 넓게 훑으므로
 * 가장 가까웠던 후보가 어느 배율에서 나왔는지 알아야 그 자리에서 보정할 수 있다.
 */
interface FoundPath {
  route: ParsedRoute;
  magnitude: number;
}

/**
 * 경유지를 거쳐 가는 삼각형들을 촘촘히 찍은 점들.
 *
 * 실제 후보 좌표가 오기 전에 "그 근처"를 받아 두기 위한 것이다. 촘촘해야 하는
 * 이유는 혼잡도다 — 서울 장소 121곳 중 경로 **근처에 있는 것**을 골라 묻는데,
 * 꼭짓점만 찍으면 사이에 있는 동네가 통째로 빠진다.
 */
function corridorPoints(
  origin: LatLng,
  destination: LatLng,
  waypoints: LatLng[],
  perLeg = 8
): LatLng[] {
  const points: LatLng[] = [];
  for (const via of waypoints) {
    for (let i = 0; i <= perLeg; i += 1) {
      points.push(interpolate(origin, via, i / perLeg));
    }
    for (let i = 1; i <= perLeg; i += 1) {
      points.push(interpolate(via, destination, i / perLeg));
    }
  }
  return points;
}

/** 요청 사이에 간격을 둘 때 쓴다. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 도로망에서 좌표열 하나를 받아 오는 방법. 공급자마다 이것만 다르다. */
export type FetchRoadRoute = (query: {
  origin: LatLng;
  destination: LatLng;
  waypoints?: LatLng[];
  /** 이 요청만 짧게 끊고 싶을 때. 없으면 설정의 기본 타임아웃. */
  timeoutMs?: number;
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
  async shortest(
    origin: LatLng,
    destination: LatLng,
    timeoutMs?: number
  ): Promise<RouteCandidate> {
    const parsed = await this.fetchRoute({ origin, destination, timeoutMs });

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

    /*
     * 환경 데이터를 **먼저 띄운다.**
     *
     * 예전엔 후보를 다 받은 뒤에 불렀다. 그래서 순위를 다듬는 값 하나가 기다리는
     * 시간의 맨 끝에 통째로 얹혔다 — 출처마다 1.5초, 바깥 시한까지 최대 2초다.
     * 후보를 받는 동안 같이 받으면 그 2초가 사라진다.
     *
     * 문제는 "어디를" 받을지였다. 실제 후보 좌표는 아직 없다. 그런데 경유지는
     * **지금 알 수 있다** — `planWaypoints`는 순수 함수다. 그래서 출발지에서
     * 경유지를 거쳐 목적지로 가는 삼각형들을 촘촘히 찍어 그 근처를 미리 받는다.
     *
     * 값이 하나 있다. 실제 길은 도로를 따라 그 삼각형에서 얼마간 벗어나므로,
     * 벗어난 만큼의 공원·건물·혼잡도는 못 받고 중립값이 된다. 순위를 조금 덜
     * 정확하게 매기는 것과 길 찾기가 2초 늦는 것 중에서 이쪽을 택했다.
     * (같은 이유로 이미 건물 1000건 상한을 받아들이고 있다 — 아래 주석 참고.)
     */
    const predicted = corridorPoints(
      origin,
      destination,
      planWaypoints({
        origin,
        destination,
        targetSec: aim,
        speedMps: DEFAULT_WALK_SPEED_MPS,
      })
    );
    const environmentSoon = withDeadline(
      loadEnvironment(predicted.length > 0 ? [predicted] : [], undefined, ENVIRONMENT_DEADLINE_MS),
      ENVIRONMENT_DEADLINE_MS + 500,
      EMPTY_ENVIRONMENT
    );

    const first = await this.fetchPaths({ origin, destination, targetSec: aim, scale: 1 });

    // 도로망은 직선이 아니라서 첫 추정은 빗나가는 게 정상이다.
    const best = closestTo(first, aim);
    const onTarget = best != null && Math.abs(best.route.durationSec - aim) <= REFINE_THRESHOLD_SEC;

    let found = first;
    if (!onTarget) {
      /*
       * 첫 라운드가 통째로 빈 날에도 한 번 더 해 본다.
       *
       * 경유지가 전부 도로망에 안 붙었다는 뜻이니 더 해 볼 게 없다고 본 적이
       * 있는데, 배율을 줄여 안쪽으로 당기면 붙는 날이 있다. 여기서 포기하면
       * 화면은 "돌아갈 길을 못 찾았어요"로 물러선다.
       */
      /*
       * 보정의 기준은 **가장 가까웠던 그 후보의 배율**이다.
       *
       * 예전엔 `1`을 넘겼다. 1라운드가 여섯을 같은 배율로 던지던 때는 그게 맞았지만,
       * 지금은 배율을 넓게 훑으므로 가장 가까웠던 것이 배율 0.5였을 수도 1.9였을
       * 수도 있다. 그걸 1로 두고 보정하면 엉뚱한 데서 출발한다.
       */
      const nextScale =
        best == null
          ? EMPTY_ROUND_SCALE
          : refineScale(best.route.durationSec, aim, best.magnitude);
      const second = await this.fetchPaths({
        origin,
        destination,
        targetSec: aim,
        scale: nextScale,
        count: REFINE_COUNT,
        // 중심이 대충 맞은 상태라 좁게 훑는다.
        spread: NARROW_SPREAD,
      }).catch(() => [] as FoundPath[]);
      found = [...first, ...second];
    }

    const parsed = found.map((entry) => entry.route);

    if (parsed.length === 0) {
      return [];
    }

    /*
     * 환경 데이터는 **검색 전체에서 한 번만** 받는다. 위에서 이미 띄워 뒀으므로
     * 여기서는 받아 놓은 것을 거둔다 — 후보를 받는 동안 같이 왔다.
     *
     * **값이 하나 있다.** 브이월드 건물 조회는 경계 상자 하나에 최대 1000건이라
     * 넓은 상자에서는 잘릴 수 있다. 잘린 만큼은 그늘이 중립값이 된다.
     * 길이 몇 초 늦는 것보다 그늘이 덜 정확한 편이 낫다고 보고 이쪽을 택했다.
     */
    const environment: Environment = await environmentSoon;

    /*
     * 건물 격자와 지나온 좌표 격자도 여기서 한 번만 만든다.
     *
     * 격자는 건물 목록에서만 나오는데(경로와 무관하다) 후보마다 만들면 같은 건물
     * 천 채로 같은 격자를 열두 번 만든다. Hermes에는 JIT이 없어 그 반복이 그대로
     * 기다리는 시간이 된다.
     */
    const buildingIndex = buildBuildingIndex(environment.buildings);
    const visitedIndex = buildVisitedIndex(previousPaths);

    return parsed.map((route) => {
      const segments = toStreetSegments(
        route.path,
        buildProfileLookup(route.path, environment.buildings, buildingIndex)
      );

      return {
        id: routeIdOf(this.idPrefix, route.path),
        durationSec: route.durationSec,
        distanceM: route.distanceM,
        path: route.path,
        segments,
        features: deriveFeatures({
          ...route,
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

  /**
   * 한 라운드의 **좌표열만** 받아 온다. 성질 계산은 하지 않는다.
   *
   * 예전엔 여기서 환경 데이터까지 받아 후보를 완성했는데, 그러면 라운드마다
   * 외부 API를 한 벌씩 더 때리게 된다. 받아 오는 일과 값을 매기는 일을 갈라
   * 두면 라운드가 몇 번이든 값 매기기는 마지막에 한 번이면 된다.
   */
  private async fetchPaths({
    origin,
    destination,
    targetSec,
    scale,
    count = CANDIDATE_COUNT,
    spread,
  }: {
    origin: LatLng;
    destination: LatLng;
    targetSec: number;
    scale: number;
    count?: number;
    spread?: number;
  }): Promise<FoundPath[]> {
    const waypoints = planWaypoints({
      origin,
      destination,
      targetSec,
      speedMps: DEFAULT_WALK_SPEED_MPS,
      count,
      scale,
      spread,
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
        return this.fetchRoute({
          origin,
          destination,
          waypoints: [waypoint],
          timeoutMs: CANDIDATE_TIMEOUT_MS,
        });
      })
    );

    /*
     * 일부 경유지는 도로망에 안 붙는다. 하나 실패해도 나머지는 살린다.
     *
     * 그리고 **성공한 것도 다시 본다.** 응답이 왔다는 것과 걸을 수 있는 길이라는
     * 것은 다른 말이다 — 공급자는 앞으로도 늘어날 것이고, 새로 붙는 쪽이 또
     * 직선을 그어 보낼 수 있다. 관문은 출처를 묻지 않는다.
     */
    /*
     * 어떤 배율이 이 길을 만들었는지 같이 들고 나간다. 보정 라운드가 그 배율에서
     * 출발해야 하기 때문이다 — 성공한 것만 남기면서 순서(=배율)를 잃으면
     * 보정이 엉뚱한 데서 시작한다.
     */
    return results.flatMap((result, index) =>
      result.status === 'fulfilled' && inspectPath(result.value.path).ok
        ? [{ route: result.value, magnitude: scale * waypointMagnitude(index, count, spread) }]
        : []
    );
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

  /*
   * 좌표만큼 숫자도 본다.
   *
   * 관문이 모양만 재고 있었다. 그런데 `durationSec`·`distanceM`은 응답에서
   * 그대로 꺼낸 값이라 타입 선언이 약속해 줄 뿐 아무도 확인하지 않는다 —
   * 필드가 빠진 응답이면 `Math.round(undefined)`가 NaN이 되어 넘어온다.
   *
   * 그 NaN은 여기서 안 막으면 `planWalk`의 기준점이 된다. 시간 예산 전체가
   * 거기서 나오므로 화면의 모든 숫자가 한꺼번에 NaN이 되고, "3분 전"이라는
   * 이 앱의 유일한 약속이 "NaN분 전"으로 나온다. 모양이 멀쩡한 좌표를
   * 받았다는 이유로 그 상태를 통과시킬 이유가 없다.
   *
   * 0초짜리 경로도 막는다. 걷는 시간이 0인 길은 목표에 맞출 자가 없다.
   */
  if (!(parsed.durationSec > 0) || !Number.isFinite(parsed.distanceM)) {
    throw new Error(`${what} 경로의 시간·거리를 제대로 받지 못했어요`);
  }
}

function closestTo(candidates: FoundPath[], targetSec: number): FoundPath | null {
  return candidates.reduce<FoundPath | null>((best, candidate) => {
    if (best == null) {
      return candidate;
    }
    return Math.abs(candidate.route.durationSec - targetSec) <
      Math.abs(best.route.durationSec - targetSec)
      ? candidate
      : best;
  }, null);
}

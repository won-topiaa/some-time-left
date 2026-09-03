/**
 * 이 좌표열이 **그려진 것인가, 도로를 따라간 것인가.**
 *
 * 공급자를 믿지 않고 결과를 검사하는 관문이다. 어디서 온 좌표든 화면에 그려지기
 * 전에 여기를 지난다.
 *
 * 있는 이유는 실제로 일어난 사고 하나다. 키 없이 만들어진 번들이 도로망을 한 번도
 * 안 본 공급자로 돌아서, 출발점에서 산 위 한 점까지 직선을 긋고 거기서 도착점까지
 * 또 직선을 그은 **삼각형**을 "3분 전에는 닿는 길이에요"와 함께 내놓았다.
 * 걸을 수 없는 길이었다. 이 앱이 파는 것이 "제때 닿는다"는 믿음 하나인데,
 * 걸을 수 없는 길을 그려 놓고 도착 시각을 약속하면 그 믿음이 통째로 거짓이 된다.
 *
 * ## 무엇을 보지 **않기로** 했는가 — 실패한 첫 설계
 *
 * 처음엔 "정점이 성기면 가짜"로 잡으려 했다. 정점 밀도가 낮거나 직선 구간이 길면
 * 거절하는 방식이다. 서울 구시가에서 재 보니 잘 갈렸다 — 진짜는 37~50개/km에
 * 최장 직선 200m 안쪽, 삼각형은 2.5개/km에 612m.
 *
 * **틀린 기준이었다.** 넓혀 재니 진짜 경로가 무더기로 걸렸다:
 *
 *   원효대교  최장 직선 1115m      성산대교  944m
 *   동작대교   917m                잠실대교  681m
 *   마포대교   416m                성수대교  414m
 *
 * 다리 상판의 보행로는 곧게 뻗어 있고 OSM에 노드가 몇 개 없다. 밀도는 26~35개/km로
 * 멀쩡한데 직선 하나가 길다. 게다가 주력인 TMAP은 **직진 구간을 좌표 두 개로 준다** —
 * 이 저장소의 TMAP 픽스처부터가 1071m에 4점(구간 301·413·358m)이다.
 * 성김은 가짜의 표시가 아니라 그냥 길이 곧다는 표시였다.
 *
 * 그 관문을 그대로 뒀다면 한강 다리를 건너는 사람과 TMAP을 쓰는 사람이
 * "길을 찾지 못했어요"를 받았을 것이다. 거짓말을 막으려다 진짜를 막는 건
 * 고친 게 아니다.
 *
 * ## 무엇을 보는가 — 보간의 흔적
 *
 * 지어낸 좌표열에는 도로에 없는 성질이 하나 있다. **중간 점이 양옆 점을 잇는 직선
 * 위에 정확히 놓여 있다.** 지어내는 코드가 두 점 사이를 선형 보간해 점을 채우기
 * 때문이다(`origin`과 `waypoint` 사이의 60% 지점 같은 것). 도로를 따라간 좌표는
 * 그럴 수 없다 — 길은 아주 조금이라도 휘고, 좌표는 소수점 여섯 자리로 온다.
 *
 * 실측으로 갈렸다. 가운데 점이 양옆을 잇는 직선에서 옆으로 얼마나 벗어났는지 재면:
 *
 *   진짜 경로 (다리 포함)   최소 39mm ~ 166mm,  완전 공선 0개
 *   삼각형 (400m·700m·1.8km) 0.000mm,          완전 공선 3개 중 2개
 *
 * 크기와 무관하게 갈린다는 점이 중요하다. 밀도로는 400m짜리 삼각형을 못 잡았는데
 * (11.8개/km로 진짜 골목과 구분이 안 된다), 이 신호는 400m에서도 그대로 잡힌다.
 * 그리고 **곧은 다리를 벌하지 않는다** — 두 점짜리 직선 구간에는 검사할 중간 점이
 * 아예 없으므로 이 검사는 그런 길에 대해 아무 말도 하지 않는다.
 *
 * ## 이 관문의 자리
 *
 * 첫 번째 방어선이 아니다. 좌표를 지어내는 코드는 아예 지웠고
 * (`route-provider.ts` 맨 위 주석), 되살아나지 않는지 보는 테스트가 따로 있다
 * (`no-fabricated-routes.test.ts`). 여기는 그 뒤에 서서, 앞으로 붙을 공급자가
 * 그려 낸 좌표를 보내올 때를 받는 자리다. 그래서 **의심스러우면 통과시킨다** —
 * 놓치는 쪽은 위의 두 방어선이 받지만, 잘못 막으면 진짜 길이 사라진다.
 */

import { distanceM, pathLengthM } from './geo';
import type { LatLng } from './types';

/** 점이 이보다 적으면 길이라고 할 수 없다. */
const MIN_POINTS = 2;

/**
 * 공선 여부를 따질 만큼 긴 구간 (m).
 *
 * 짧은 구간에서는 좌표 자릿수(소수점 여섯 자리 ≈ 11cm)의 반올림만으로도 점이
 * 직선 위에 놓인 것처럼 보인다. 도로 위의 촘촘한 점들을 억울하게 의심하지 않도록
 * 양옆이 모두 이만큼 떨어진 점만 본다.
 */
const TESTABLE_LEG_M = 50;

/**
 * 이보다 덜 벗어났으면 "직선 위에 놓였다"고 본다 (m).
 *
 * 실측한 진짜 경로의 최소 벗어남이 39mm였다. 1mm는 그보다 39배 아래이면서,
 * 보간으로 찍은 점(정확히 0)과는 확실히 구분된다.
 */
const COLLINEAR_TOLERANCE_M = 0.001;

/**
 * 검사할 점이 이보다 적으면 판단하지 않는다.
 *
 * 한두 개가 우연히 직선 위에 놓이는 일은 진짜 길에서도 있다. 그걸로 길을
 * 버리지 않는다 — 지어낸 좌표열은 **거의 전부**가 직선 위에 있다.
 */
const MIN_TESTABLE = 2;

export type RouteRejection = 'too-few-points' | 'zero-length' | 'drawn-not-routed';

export interface RouteSanity {
  ok: boolean;
  /** 통과하지 못한 이유. 통과했으면 null. */
  reason: RouteRejection | null;
  /** 공선 여부를 따져 본 중간 점의 수. */
  testable: number;
  /** 그중 직선 위에 놓여 있던 것의 수. */
  collinear: number;
  lengthM: number;
}

const METERS_PER_DEG = 111320;

/**
 * `b`가 `a`와 `c`를 잇는 직선에서 옆으로 얼마나 벗어났나 (m).
 * 몇백 미터 범위라 국소 평면으로 근사해도 오차가 무시할 만하다.
 */
function lateralOffsetM(a: LatLng, b: LatLng, c: LatLng): number {
  const perLng = METERS_PER_DEG * Math.cos((a.lat * Math.PI) / 180);
  const bx = (b.lng - a.lng) * perLng;
  const by = (b.lat - a.lat) * METERS_PER_DEG;
  const cx = (c.lng - a.lng) * perLng;
  const cy = (c.lat - a.lat) * METERS_PER_DEG;

  const span = Math.hypot(cx, cy);
  if (span < 1e-9) {
    return 0;
  }
  // a→c 직선과 점 b 사이의 거리 = |외적| / |a→c|
  return Math.abs(cx * by - bx * cy) / span;
}

/**
 * 좌표열을 재 본다. 화면에 그리기 전에 부른다.
 *
 * 판단을 부르는 쪽에 맡기지 않고 여기서 내린다 — 화면마다 "이 정도면 괜찮나"를
 * 따로 판단하기 시작하면 관문이 관문이 아니게 된다.
 */
export function inspectPath(path: LatLng[]): RouteSanity {
  if (path.length < MIN_POINTS) {
    return { ok: false, reason: 'too-few-points', testable: 0, collinear: 0, lengthM: 0 };
  }

  const lengthM = pathLengthM(path);
  if (lengthM <= 0) {
    return { ok: false, reason: 'zero-length', testable: 0, collinear: 0, lengthM: 0 };
  }

  let testable = 0;
  let collinear = 0;
  for (let i = 1; i < path.length - 1; i += 1) {
    // 양옆이 충분히 멀 때만 본다. 촘촘한 점들은 반올림만으로 직선처럼 보인다.
    if (
      distanceM(path[i - 1], path[i]) < TESTABLE_LEG_M ||
      distanceM(path[i], path[i + 1]) < TESTABLE_LEG_M
    ) {
      continue;
    }
    testable += 1;
    if (lateralOffsetM(path[i - 1], path[i], path[i + 1]) < COLLINEAR_TOLERANCE_M) {
      collinear += 1;
    }
  }

  const measured = { testable, collinear, lengthM };

  /*
   * 볼 만한 점이 충분히 있는데 그 **과반이** 직선 위에 놓였으면 그려진 것이다.
   * 도로를 따라간 좌표에서는 하나도 안 나온다(실측 최소 벗어남 39mm).
   *
   * 볼 점이 모자라면 아무 말도 하지 않는다 — 곧은 다리나 두 점짜리 직진 구간이
   * 그렇다. 의심스러우면 통과시킨다.
   */
  if (testable >= MIN_TESTABLE && collinear * 2 > testable) {
    return { ok: false, reason: 'drawn-not-routed', ...measured };
  }

  return { ok: true, reason: null, ...measured };
}

/** 걸을 수 있는 길인가. 이유가 필요 없을 때. */
export function isWalkablePath(path: LatLng[]): boolean {
  return inspectPath(path).ok;
}

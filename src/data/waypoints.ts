/**
 * 우회 경유지 생성.
 *
 * "정확히 T분 걸리면서 점수가 최대인 경로"는 Arc Orienteering Problem이고 NP-hard다.
 * 대신 훨씬 싼 방법을 쓴다 — 최단 경로 양옆으로 경유지를 하나 찍어서 길을 늘리고,
 * 실제 소요 시간은 도보 API가 알려준 값으로 랭킹한다.
 *
 * 경유지를 옆으로 d만큼 밀면 경로 길이는 대략 2 * sqrt((L/2)^2 + d^2) 가 된다.
 * 목표 길이 T를 넣고 d에 대해 풀면 초기 추정값이 닫힌 형태로 나온다.
 */

import { bearingDeg, distanceM, interpolate, offsetPoint } from '../domain/geo';
import type { LatLng } from '../domain/types';

const DEG = Math.PI / 180;

/**
 * 기하 추정이 실제 보행로보다 **짧게** 잡히는 만큼을 미리 깎는다.
 *
 * `offsetForTargetDistance`는 경유지를 지나는 길을 삼각형 두 변으로 본다. 그런데
 * 실제 보행로는 블록을 돌아가느라 그 두 변보다 길다. 실측으로 확인했다 —
 * 겨냥 38분짜리 요청을 배율 1.0으로 던지니 50.0분과 58.1분이 돌아왔다(+31%).
 * 같은 경로에서 목표에 닿은 배율은 0.6~0.7 사이였다.
 *
 * 그래서 기본 배율을 여기서 한 번 깎아 둔다. 이게 없으면 후보 전부가 목표를
 * 넘겨 `arrivesOnTime` 관문에서 걸러지고, 화면에는 고를 것이 한 장도 안 남는다.
 */
export const DETOUR_BIAS = 0.7;

/**
 * 1라운드에서 배율을 훑는 폭. 배율 `[1/2, 2]`를 로그 간격으로 훑는다.
 *
 * **하나를 정확히 맞추려 하지 않는다.** 배율과 실제 소요의 관계가 비단조라서
 * 그럴 수가 없다 — 경유지가 조금 움직이면 다른 길로 스냅되면서 소요가 껑충 뛴다.
 * 실측: 배율 0.55에서 32.4분이던 것이 0.40에서 40.8분이 됐다(거꾸로 올라갔다).
 * 그러니 여섯을 같은 배율로 던지는 대신, 목표를 **감싸도록** 넓게 벌려 던지고
 * 걸린 것을 쓴다. 요청 수는 그대로다.
 */
export const WIDE_SPREAD = 2;

/** 보정 라운드의 폭. 중심이 대충 맞은 상태라 좁게 훑는다. */
export const NARROW_SPREAD = 1.25;

/**
 * `count`개를 `[1/spread, spread]`에 로그 간격으로 놓았을 때 `index`번째 배수.
 *
 * 가운데가 1이 되도록 대칭으로 놓는다 — 보정 라운드에서 중심(이미 한 번 맞춰 본
 * 배율)이 그대로 후보에 들어 있어야, 넓게 훑다가 오히려 나빠지는 일이 없다.
 */
export function waypointMagnitude(index: number, count: number, spread = WIDE_SPREAD): number {
  if (count <= 1 || spread <= 1) {
    return 1;
  }
  const t = index / (count - 1);
  return Math.pow(spread, 2 * t - 1);
}

/**
 * 직선 거리 `directM`인 구간을 `targetM`까지 늘리려면
 * 중간 지점을 옆으로 얼마나 밀어야 하는가 (m).
 */
export function offsetForTargetDistance(directM: number, targetM: number): number {
  if (targetM <= directM) {
    return 0;
  }
  return Math.sqrt((targetM / 2) ** 2 - (directM / 2) ** 2);
}

/**
 * 출발–도착 선분 위 `alongRatio` 지점에서 수직으로 `offsetM`만큼 벗어난 경유지.
 * `offsetM`이 음수면 반대쪽으로 벌어진다.
 */
export function perpendicularWaypoint(
  origin: LatLng,
  destination: LatLng,
  alongRatio: number,
  offsetM: number
): LatLng {
  const base = interpolate(origin, destination, alongRatio);
  const perpendicular = (bearingDeg(origin, destination) + 90) * DEG;

  return offsetPoint(
    base,
    offsetM * Math.sin(perpendicular),
    offsetM * Math.cos(perpendicular)
  );
}

export interface WaypointPlanOptions {
  origin: LatLng;
  destination: LatLng;
  /** 이만큼 걸리는 경로를 원한다 (초) */
  targetSec: number;
  /** 보행 속도 (m/s) */
  speedMps: number;
  /** 만들 후보 개수 */
  count?: number;
  /** 이전 시도의 결과로 보정할 배율 (1이면 보정 없음) */
  scale?: number;
  /** 배율을 훑는 폭. 기본은 넓게 — 이유는 WIDE_SPREAD에. */
  spread?: number;
}

/**
 * 후보 경유지 목록. 각 항목이 경로 한 개가 된다.
 *
 * 좌우 양쪽으로, 그리고 선분 위 서로 다른 지점에서 벌린다.
 * 같은 목표 길이라도 벌어지는 위치가 다르면 전혀 다른 동네를 지난다.
 */
export function planWaypoints({
  origin,
  destination,
  targetSec,
  speedMps,
  count = 6,
  scale = 1,
  spread = WIDE_SPREAD,
}: WaypointPlanOptions): LatLng[] {
  const directM = distanceM(origin, destination);
  const targetM = targetSec * speedMps;
  const baseOffset = offsetForTargetDistance(directM, targetM) * scale * DETOUR_BIAS;

  if (baseOffset <= 0) {
    return [];
  }

  /*
   * 선분 위 어디서 벌릴지 × 얼마나 벌릴지.
   *
   * 예전엔 벌리는 양이 ±15%(`[1, 0.85, 1.15]`)뿐이었다. 기하 추정이 30% 넘게
   * 빗나가는데 ±15%를 흔들어 봐야 여섯 개가 다 같은 데 몰린다 — 실측에서
   * 후보 10개가 41.9~60.7분에 뭉쳐 목표 40분을 전부 넘겼다.
   */
  const alongRatios = [0.5, 0.35, 0.65];

  const waypoints: LatLng[] = [];
  for (let i = 0; i < count; i += 1) {
    const side = i % 2 === 0 ? 1 : -1;
    const alongRatio = alongRatios[i % alongRatios.length];
    const magnitude = waypointMagnitude(i, count, spread);

    waypoints.push(
      perpendicularWaypoint(origin, destination, alongRatio, baseOffset * magnitude * side)
    );
  }
  return waypoints;
}

/**
 * 실제로 돌아온 소요 시간을 보고 다음 시도의 배율을 정한다.
 * 도로망은 직선이 아니라서 첫 추정이 빗나가는 게 정상이다.
 */
export function refineScale(
  achievedSec: number,
  targetSec: number,
  previousScale: number
): number {
  if (achievedSec <= 0) {
    return previousScale;
  }
  /*
   * 오차를 **전부** 반영한다.
   *
   * 절반만 반영한 적이 있다. 크게 흔들리지 않게 하려던 것인데, 보정 라운드가
   * 한 번뿐이라 30% 빗나간 것이 15%만 줄고 그대로 화면에 나갔다. 절반씩 다가가는
   * 것은 라운드를 여러 번 돌 때의 이야기다.
   *
   * 한 번에 크게 움직이는 위험은 폭(`NARROW_SPREAD`)이 받아 준다 — 중심이
   * 빗나가도 그 주위를 훑으므로 가운데 하나에 전부를 걸지 않는다.
   */
  const next = previousScale * (targetSec / achievedSec);
  return Math.min(3, Math.max(0.3, next));
}

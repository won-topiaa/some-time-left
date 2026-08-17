/**
 * "3분 전 도착"을 시간 예산으로 번역하는 계층.
 *
 * 이 앱의 모든 것이 여기서 시작한다. 3분은 설정값이 아니라 정체성이므로
 * 상수로 고정하고, UI에서 사용자에게 바꾸게 하지 않는다.
 */

/** 약속 시각보다 얼마나 먼저 도착할 것인가. 제품의 정체성이므로 고정. */
export const ARRIVE_EARLY_SEC = 3 * 60;

/**
 * 최단 경로 대비 최대 몇 배까지 늘릴 것인가.
 * 도보 20~40분이 타겟이므로 2.2배면 44~88분 — 그 이상은 걷기가 아니라 방황이다.
 */
export const MAX_STRETCH_RATIO = 2.2;

/** 이 정도 여유로는 우회할 게 없다. 그냥 곧장 가는 게 낫다. */
export const STRAIGHT_TOLERANCE_SEC = 90;

export type WalkPlan =
  | {
      kind: 'stretch';
      /** 이만큼 걸리는 경로를 찾아야 한다 (초) */
      targetWalkSec: number;
      /** 최단 경로 대비 남는 여유 (초) */
      slackSec: number;
      /** 여유가 너무 많아 상한에서 잘렸는가 */
      capped: boolean;
    }
  | {
      kind: 'straight';
      /** 'no-slack': 여유가 없음 / 'no-early': 3분 전은 못 맞추지만 정시엔 도착 */
      reason: 'no-slack' | 'no-early';
      targetWalkSec: number;
    }
  | {
      kind: 'too-late';
      /** 최단으로 가도 이만큼 늦는다 (초) */
      shortBySec: number;
    };

export interface PlanInput {
  /** 지금 (epoch ms). 기기 시계가 아니라 서버 시각을 넣을 것. */
  nowMs: number;
  /** 약속 시각 (epoch ms) */
  arriveAtMs: number;
  /** 최단 도보 경로의 소요 시간 (초) */
  shortestSec: number;
}

/**
 * 지금 시각과 약속 시각으로부터 "얼마짜리 경로를 찾아야 하는가"를 계산한다.
 *
 * 네 갈래로 갈린다.
 * - 여유가 넉넉함 → 늘린다 (stretch)
 * - 여유가 거의 없음 → 곧장 간다 (straight / no-slack)
 * - 3분 전은 못 맞추지만 정시엔 도착 → 곧장 간다 (straight / no-early)
 * - 최단으로도 늦음 → 정직하게 말한다 (too-late)
 */
export function planWalk({ nowMs, arriveAtMs, shortestSec }: PlanInput): WalkPlan {
  const untilAppointmentSec = Math.round((arriveAtMs - nowMs) / 1000);

  if (untilAppointmentSec < shortestSec) {
    return { kind: 'too-late', shortBySec: shortestSec - untilAppointmentSec };
  }

  // 3분 전에 도착하려면 실제로 걸을 수 있는 시간
  const budgetSec = untilAppointmentSec - ARRIVE_EARLY_SEC;

  if (budgetSec < shortestSec) {
    // 정시엔 닿지만 3분 전은 무리. 앱이 해줄 게 없으니 솔직하게.
    return { kind: 'straight', reason: 'no-early', targetWalkSec: shortestSec };
  }

  const slackSec = budgetSec - shortestSec;

  if (slackSec <= STRAIGHT_TOLERANCE_SEC) {
    return { kind: 'straight', reason: 'no-slack', targetWalkSec: shortestSec };
  }

  const maxWalkSec = Math.round(shortestSec * MAX_STRETCH_RATIO);
  const capped = budgetSec > maxWalkSec;

  return {
    kind: 'stretch',
    targetWalkSec: capped ? maxWalkSec : budgetSec,
    slackSec,
    capped,
  };
}

/** "12분" / "1시간 5분" 처럼 사람이 읽는 길이로. */
export function formatDuration(sec: number): string {
  const total = Math.max(0, Math.round(sec / 60));
  if (total < 60) {
    return `${total}분`;
  }
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

/** 약속 시각을 "오후 2시 30분"으로. */
export function formatClock(ms: number, timeZone = 'Asia/Seoul'): string {
  return new Intl.DateTimeFormat('ko-KR', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(new Date(ms));
}

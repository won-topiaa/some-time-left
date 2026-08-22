/**
 * "약속보다 먼저 도착"을 시간 예산으로 번역하는 계층.
 *
 * 이 앱의 모든 것이 여기서 시작한다. 몇 분 전인지는 설정값이 아니라 정체성이므로
 * 상수로 고정하고, UI에서 사용자에게 바꾸게 하지 않는다.
 */

/**
 * 약속 시각보다 얼마나 먼저 도착할 것인가. 제품의 정체성이므로 고정.
 *
 * 3분이었다가 5분이 됐다. 3분은 실제로 걸어 보니 너무 얇았다 — 신호 하나,
 * 횡단보도 한 번, 도로망 추정 오차 몇십 초면 그대로 약속 시각을 넘긴다.
 * 5분으로 잡으면 그 정도가 다 흡수되고, 넘치더라도 여전히 약속 전에 닿는다.
 * **먼저 도착하는 앱이 늦는 것보다 나쁜 실패는 없다.**
 *
 * 화면 문구는 이 상수에서 뽑아 쓴다(`copy.ts`). 손으로 적어 두면
 * 숫자를 바꾸는 날 화면만 옛말을 하게 된다.
 */
export const ARRIVE_EARLY_SEC = 5 * 60;

/** "5분" 처럼 사람에게 말할 때의 단위. 문구가 상수에서 갈라지지 않게 한 군데서 낸다. */
export const ARRIVE_EARLY_MIN = Math.round(ARRIVE_EARLY_SEC / 60);

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
      /** 'no-slack': 여유가 없음 / 'no-early': 약속 전 여유는 못 맞추지만 정시엔 도착 */
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
 * - 약속 전 여유는 못 맞추지만 정시엔 도착 → 곧장 간다 (straight / no-early)
 * - 최단으로도 늦음 → 정직하게 말한다 (too-late)
 */
export function planWalk({ nowMs, arriveAtMs, shortestSec }: PlanInput): WalkPlan {
  const untilAppointmentSec = Math.round((arriveAtMs - nowMs) / 1000);

  if (untilAppointmentSec < shortestSec) {
    return { kind: 'too-late', shortBySec: shortestSec - untilAppointmentSec };
  }

  // 약속보다 ARRIVE_EARLY_SEC 먼저 닿으려면 실제로 걸을 수 있는 시간
  const budgetSec = untilAppointmentSec - ARRIVE_EARLY_SEC;

  if (budgetSec < shortestSec) {
    // 정시엔 닿지만 여유를 두고는 무리. 앱이 해줄 게 없으니 솔직하게.
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

/**
 * 지금 나서면 몇 시에 닿는가 (epoch ms).
 *
 * 화면이 소요 시간만 보여주면 "몇 분 전"은 앱만 아는 약속이 된다. 사용자가 그걸
 * 검산하려면 머릿속에서 지금 시각에 분을 더해야 하는데, 그건 이 앱이 대신 하기로 한 일이다.
 * 다른 길을 눌러 시간이 달라져도 이 숫자가 그대로면 약속이 지켜진 것이 눈에 보인다.
 */
export function arrivalAt(departAtMs: number, durationSec: number): number {
  return departAtMs + durationSec * 1000;
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

/**
 * 약속 시각을 "오후 2시 30분"으로.
 *
 * Hermes에서 Intl.DateTimeFormat이 빠져 있거나 불완전한 빌드가 있다.
 * trace.ts와 같은 방식으로 KST UTC+9 산술을 쓴다.
 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function formatClock(ms: number): string {
  const shifted = new Date(ms + KST_OFFSET_MS);
  const h24 = shifted.getUTCHours();
  const m = shifted.getUTCMinutes();

  const period = h24 < 12 ? '오전' : '오후';
  const h = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
  return m === 0 ? `${period} ${h}시` : `${period} ${h}시 ${String(m).padStart(2, '0')}분`;
}

/** 하루 (ms). 한국은 서머타임이 없어 이 산술이 그대로 맞는다. */
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ClockInput {
  /** 1~12. 사람이 적는 대로. */
  hour12: number;
  /** 0~59 */
  minute: number;
  /**
   * 오전/오후를 사람이 직접 정했으면 그것을 쓴다.
   * null이면 앱이 고른다 — 아래 `resolveAppointment` 참고.
   */
  period: 'am' | 'pm' | null;
}

/** 오늘(한국 기준)의 그 시각. */
function atKstClock(nowMs: number, hour24: number, minute: number): number {
  const dayStart = Math.floor((nowMs + KST_OFFSET_MS) / DAY_MS) * DAY_MS;
  return dayStart + hour24 * 60 * 60 * 1000 + minute * 60 * 1000 - KST_OFFSET_MS;
}

/**
 * 사람이 적은 시각을 실제 시각으로.
 *
 * 두 가지를 앱이 메운다. 둘 다 화면에 결과를 보여 주고 고칠 수 있게 두는 것이 전제다 —
 * 조용히 정해 버리면 약속에 늦는 종류의 친절이 된다.
 *
 * 1. **오전/오후를 안 골랐으면 다가오는 쪽으로 읽는다.** 오후 3시에 "6:30"을 적은
 *    사람이 뜻한 건 거의 언제나 오늘 저녁이지 내일 아침이 아니다.
 * 2. **이미 지난 시각이면 내일로 넘긴다.** 밤 11시에 "8:00"은 내일 아침이다.
 *
 * 범위를 벗어나면 null. 화면은 이때 아무 말도 하지 않고 다음 버튼만 잠근다 —
 * 두 글자 적는 중인 사람에게 빨간 글씨를 띄울 이유가 없다.
 */
export function resolveAppointment(input: ClockInput, nowMs: number): number | null {
  const { hour12, minute, period } = input;

  if (!Number.isInteger(hour12) || !Number.isInteger(minute)) {
    return null;
  }
  if (hour12 < 0 || hour12 > 23 || minute < 0 || minute > 59) {
    return null;
  }

  /*
   * 24시간으로 적는 사람을 받아준다.
   *
   * 오후 6시 반 약속에 "18:30"을 적는 건 아주 흔한 일인데, 1~12만 받던 때는
   * 그게 조용히 null이 되어 **다음 버튼이 이유 없이 죽었다.** 화면에는 아무 말도
   * 안 나오니 사용자는 무엇이 잘못됐는지 알 방법이 없었다.
   *
   * 0시와 13~23시는 오전/오후가 이미 정해진 값이라 토글보다 이쪽이 이긴다 —
   * "18시"라고 적어 놓고 오전을 골랐다면 적은 쪽이 뜻이 분명하다.
   */
  if (hour12 === 0 || hour12 > 12) {
    const at = atKstClock(nowMs, hour12, minute);
    return at > nowMs ? at : at + DAY_MS;
  }

  const base = hour12 % 12;

  if (period != null) {
    const at = atKstClock(nowMs, period === 'pm' ? base + 12 : base, minute);
    return at > nowMs ? at : at + DAY_MS;
  }

  // 오전/오후 둘 다 뒤에 오는 쪽이 있으면 가까운 쪽. 하나뿐이면 그것.
  const candidates = [base, base + 12]
    .map((h24) => atKstClock(nowMs, h24, minute))
    .map((at) => (at > nowMs ? at : at + DAY_MS));

  return Math.min(...candidates);
}

/** 오늘인가 내일인가. 적은 시각이 언제로 읽혔는지 화면에서 보이게 하려고. */
export function dayLabel(ms: number, nowMs: number): '오늘' | '내일' | '그 뒤' {
  const day = (t: number) => Math.floor((t + KST_OFFSET_MS) / DAY_MS);
  const diff = day(ms) - day(nowMs);
  return diff <= 0 ? '오늘' : diff === 1 ? '내일' : '그 뒤';
}

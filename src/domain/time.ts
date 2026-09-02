/**
 * "약속보다 먼저 도착"을 시간 예산으로 번역하는 계층.
 *
 * 이 앱의 모든 것이 여기서 시작한다. 몇 분 전인지는 설정값이 아니라 정체성이므로
 * 상수로 고정하고, UI에서 사용자에게 바꾸게 하지 않는다.
 */

import { isWetDay, type Weather } from './weather';

/**
 * 약속 시각보다 얼마나 먼저 도착할 것인가. 제품의 정체성이므로 사용자가 바꾸지 않는다.
 *
 * 3분이었다가 5분이 됐다. 3분은 실제로 걸어 보니 너무 얇았다 — 신호 하나,
 * 횡단보도 한 번, 도로망 추정 오차 몇십 초면 그대로 약속 시각을 넘긴다.
 * 5분으로 잡으면 그 정도가 다 흡수되고, 넘치더라도 여전히 약속 전에 닿는다.
 * **먼저 도착하는 앱이 늦는 것보다 나쁜 실패는 없다.**
 *
 * 바꾸는 건 사용자가 아니라 날씨다. 내리는 날은 `WET_ARRIVE_EARLY_SEC`로 물러나고,
 * 그 갈림은 `arriveEarlySecFor` 한 군데가 한다. 계획(`WalkPlan`)이 그날의 값을
 * 직접 들고 다니므로 화면 문구는 계획에서 뽑아 쓴다(`copy.ts`) — 상수를 손으로
 * 적어 두면 비 오는 날 화면만 맑은 날 말을 하게 된다.
 */
export const ARRIVE_EARLY_SEC = 5 * 60;

/**
 * 내리는 날의 목표. 맑은 날보다 2분 더.
 *
 * 비 오는 날의 5분은 맑은 날의 3분이다 — 우산을 펴고 접는 데, 물웅덩이를 돌아가는 데,
 * 횡단보도 앞에서 처마를 찾는 데 그 2분이 그대로 새어 나간다. 젖은 채로 뛰어
 * 들어가는 것이 이 앱이 만들려는 마지막 장면과 가장 먼 모습이기도 하다.
 */
export const WET_ARRIVE_EARLY_SEC = 7 * 60;

/** "5분" 처럼 사람에게 말할 때의 단위. 문구가 초에서 갈라지지 않게 한 군데서 낸다. */
export function earlyMinutes(earlySec: number): number {
  return Math.round(earlySec / 60);
}

/**
 * 화면이 **약속하는** 분. 목표(겨누는 값)가 아니라 바닥(어떤 경우에도 그 앞에는 닿는 값)이다.
 *
 * 코드는 5분을 겨누지만 화면은 "3분 전"이라고 말한다. 겨눈 값을 말하면 도로망 오차
 * 몇십 초로 4분 전에 닿은 날 앱이 거짓말을 한 것이 되고, 바닥을 말하면 그날도 약속을
 * 지킨 것이다. 지킬 수 있는 숫자만 말한다. 나머지 2분은 말하지 않는 여유다.
 *
 * 내리는 날은 이 숫자를 화면에 적지 않는다("조금 더 일찍"). 그래도 셈은 같다 — 7분을
 * 겨누고 5분 전을 지킨다.
 */
export function promisedMinutes(earlySec: number): number {
  return earlyMinutes(earlySec - (ARRIVE_EARLY_SEC - PROMISE_FLOOR_SEC));
}

/** 이 계획이 내리는 날의 목표를 겨눴는가. 문구가 숫자 대신 "조금 더 일찍"을 고를 때 쓴다. */
export function isWetTarget(earlySec: number): boolean {
  return earlySec > ARRIVE_EARLY_SEC;
}

/**
 * 오늘의 목표 (초). 날씨 하나로 갈린다.
 *
 * 날씨를 못 읽은 날(null)은 맑은 날이다 — 모르는 것을 이유로 사람을 2분 더
 * 일찍 보내지 않는다.
 */
export function arriveEarlySecFor(weather: Weather | null): number {
  return isWetDay(weather) ? WET_ARRIVE_EARLY_SEC : ARRIVE_EARLY_SEC;
}

/**
 * 여기보다 늦게 닿는 길은 **어떤 이유로도 내놓지 않는다** (초).
 *
 * 목표(`ARRIVE_EARLY_SEC`)와 바닥(`PROMISE_FLOOR_SEC`)을 나눠 두는 이유:
 *
 * 후보 경로는 경유지를 흩뿌려 만들고 소요 시간은 도보 API가 알려준다. 그래서
 * 목표를 정확히 맞히지 못하고 그 언저리로 흩어진다 — 목표를 1초라도 넘기면
 * 버리게 해 뒀더니 **후보가 거의 전멸했다.** 기분을 무엇으로 골라도 늘 같은 길
 * (최단 경로)만 나오고 화면은 "딱 맞는 길이 없었어요"만 반복했다.
 *
 * 목표는 5분 전으로 겨누되, 3분 전까지는 받는다. 그래도 약속에는 늦지 않는다 —
 * 그게 이 앱이 지키기로 한 전부다. 나머지 2분은 도로망 추정 오차가 쓰는 몫이다.
 */
export const PROMISE_FLOOR_SEC = 3 * 60;

/*
 * 바닥은 목표에 붙어 움직인다. `route-plan.ts`가 두 상수의 **차이**(2분)만 쓰므로
 * 비 오는 날 목표가 7분이 되면 바닥은 5분이 된다 — 맑은 날 3분과 같은 폭이고,
 * 그 2분이 도로망 오차의 몫이라는 뜻도 그대로다.
 */

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
      /** 이 계획이 겨눈 "약속 몇 초 전" — 문구가 이 값으로 말한다. */
      earlySec: number;
    }
  | {
      kind: 'straight';
      /** 'no-slack': 여유가 없음 / 'no-early': 약속 전 여유는 못 맞추지만 정시엔 도착 */
      reason: 'no-slack' | 'no-early';
      targetWalkSec: number;
      /** 못 맞춘 그 "몇 분 전"이 얼마였는지. no-early 문구가 이 숫자를 말한다. */
      earlySec: number;
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
  /**
   * 약속 몇 초 전을 겨눌 것인가. 날씨가 정한다(`arriveEarlySecFor`).
   *
   * 기본값을 두지 않는다. 두면 잊힌 호출 자리가 조용히 맑은 날 값으로 계획해
   * 비 오는 날 화면만 5분을 말하게 되는데, 그걸 잡을 시험이 화면 코드에는 없다.
   * 빠뜨리면 컴파일이 막게 둔다.
   */
  earlySec: number;
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
export function planWalk({ nowMs, arriveAtMs, shortestSec, earlySec }: PlanInput): WalkPlan {
  const untilAppointmentSec = Math.round((arriveAtMs - nowMs) / 1000);

  if (untilAppointmentSec < shortestSec) {
    return { kind: 'too-late', shortBySec: shortestSec - untilAppointmentSec };
  }

  // 약속보다 earlySec 먼저 닿으려면 실제로 걸을 수 있는 시간
  const budgetSec = untilAppointmentSec - earlySec;

  if (budgetSec < shortestSec) {
    // 정시엔 닿지만 여유를 두고는 무리. 앱이 해줄 게 없으니 솔직하게.
    return { kind: 'straight', reason: 'no-early', targetWalkSec: shortestSec, earlySec };
  }

  const slackSec = budgetSec - shortestSec;

  if (slackSec <= STRAIGHT_TOLERANCE_SEC) {
    return { kind: 'straight', reason: 'no-slack', targetWalkSec: shortestSec, earlySec };
  }

  const maxWalkSec = Math.round(shortestSec * MAX_STRETCH_RATIO);
  const capped = budgetSec > maxWalkSec;

  return {
    kind: 'stretch',
    targetWalkSec: capped ? maxWalkSec : budgetSec,
    slackSec,
    capped,
    earlySec,
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

/**
 * 지금 나서면 너무 이른 날, **언제 나서면 되는가** (epoch ms).
 *
 * 여유가 상한을 넘으면(`capped`) 앱은 최단의 2.2배까지만 길을 늘린다. 그래서
 * 87분 남았는데 44분짜리 길을 주고 "넉넉히 걸어볼까요"라고 말하는 날이 생긴다 —
 * 그건 대답이 아니라 회피다. 사용자가 정말 알고 싶은 건 **몇 시에 나서면 되는지**다.
 *
 * 고른 길을 그대로 걸어서 약속 `earlySec` 앞에 닿으려면 언제 출발해야 하는지를
 * 되짚어 준다. 계획과 같은 값을 넣어야 한다 — 비 오는 날 계획은 7분 전을 겨눴는데
 * 여기가 5분으로 되짚으면 나서라는 시각이 2분 늦는다. 지금 나서도 되는 날(늦었거나
 * 딱 맞는 날)은 null — 기다리라고 할 이유가 없으면 말하지 않는다.
 */
export function departAt(
  arriveAtMs: number,
  walkSec: number,
  nowMs: number,
  earlySec: number
): number | null {
  const leaveAtMs = arriveAtMs - (earlySec + walkSec) * 1000;

  // 이미 그 시각을 지났으면 지금이 나설 때다.
  return leaveAtMs > nowMs ? leaveAtMs : null;
}

/**
 * 나설 때까지 남은 시간 (초). 지금 나서야 하면 0.
 *
 * 화면이 "35분 뒤에 나서세요"라고 말할 때 쓰는 값이다. 시각만으로는 지금과의
 * 거리를 매번 사람이 빼야 한다 — 그 뺄셈이 이 앱이 대신 하기로 한 일이다.
 */
export function waitSec(leaveAtMs: number | null, nowMs: number): number {
  return leaveAtMs == null ? 0 : Math.max(0, Math.round((leaveAtMs - nowMs) / 1000));
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

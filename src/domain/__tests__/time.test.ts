import { describe, expect, it } from 'vitest';
import {
  ARRIVE_EARLY_SEC,
  MAX_STRETCH_RATIO,
  arrivalAt,
  dayLabel,
  formatClock,
  formatDuration,
  planWalk,
  resolveAppointment,
} from '../time';

const MIN = 60;
/** 약속보다 몇 분 먼저 닿기로 했는가. 숫자를 적어 두면 상수를 바꾸는 날 테스트만 옛말을 한다. */
const EARLY_MIN = ARRIVE_EARLY_SEC / MIN;

describe('planWalk', () => {
  const now = Date.UTC(2026, 7, 17, 3, 0, 0);
  const at = (minutesFromNow: number) => now + minutesFromNow * 60_000;

  it('여유가 넉넉하면 약속 앞 도착에 맞춰 경로를 늘린다', () => {
    // 30분 뒤 약속, 최단 20분 → 약속 EARLY_MIN분 전에 닿는 경로
    const plan = planWalk({ nowMs: now, arriveAtMs: at(30), shortestSec: 20 * MIN });

    expect(plan.kind).toBe('stretch');
    if (plan.kind !== 'stretch') return;
    expect(plan.targetWalkSec).toBe((30 - EARLY_MIN) * MIN);
    expect(plan.slackSec).toBe((30 - EARLY_MIN - 20) * MIN);
    expect(plan.capped).toBe(false);
  });

  it('사용자가 말한 그 상황 — 20분 거리에 30분 남음', () => {
    const plan = planWalk({ nowMs: now, arriveAtMs: at(30), shortestSec: 20 * MIN });
    if (plan.kind !== 'stretch') throw new Error('stretch여야 한다');

    // 목표대로 걸으면 약속 EARLY_MIN분 전에 도착한다
    const arrivalMs = now + plan.targetWalkSec * 1000;
    expect(at(30) - arrivalMs).toBe(ARRIVE_EARLY_SEC * 1000);
  });

  it('여유가 1분 남짓이면 우회하지 않고 곧장 간다', () => {
    // 최단 20분 + 여유 1분 + 먼저 닿을 시간 → 우회할 게 없다
    const plan = planWalk({
      nowMs: now,
      arriveAtMs: at(20 + 1 + EARLY_MIN),
      shortestSec: 20 * MIN,
    });

    expect(plan.kind).toBe('straight');
    if (plan.kind !== 'straight') return;
    expect(plan.reason).toBe('no-slack');
  });

  it('먼저 닿기는 못 하지만 정시엔 닿으면 솔직하게 곧장 가라고 한다', () => {
    // 최단 20분인데 약속까지 21분 → EARLY_MIN분을 빼면 예산이 최단에 못 미친다
    const plan = planWalk({ nowMs: now, arriveAtMs: at(21), shortestSec: 20 * MIN });

    expect(plan.kind).toBe('straight');
    if (plan.kind !== 'straight') return;
    expect(plan.reason).toBe('no-early');
    expect(plan.targetWalkSec).toBe(20 * MIN);
  });

  it('최단으로도 늦으면 얼마나 늦는지 말한다', () => {
    const plan = planWalk({ nowMs: now, arriveAtMs: at(15), shortestSec: 20 * MIN });

    expect(plan.kind).toBe('too-late');
    if (plan.kind !== 'too-late') return;
    expect(plan.shortBySec).toBe(5 * MIN);
  });

  it('여유가 과하면 상한에서 자르고 그 사실을 표시한다', () => {
    // 90분 뒤 약속, 최단 20분 → 87분을 다 걷게 하지 않는다
    const plan = planWalk({ nowMs: now, arriveAtMs: at(90), shortestSec: 20 * MIN });

    expect(plan.kind).toBe('stretch');
    if (plan.kind !== 'stretch') return;
    expect(plan.capped).toBe(true);
    expect(plan.targetWalkSec).toBe(Math.round(20 * MIN * MAX_STRETCH_RATIO));
    expect(plan.targetWalkSec).toBeLessThan(87 * MIN);
  });

  it('타겟인 40분 거리에서도 동작한다', () => {
    const plan = planWalk({ nowMs: now, arriveAtMs: at(50), shortestSec: 40 * MIN });

    expect(plan.kind).toBe('stretch');
    if (plan.kind !== 'stretch') return;
    expect(plan.targetWalkSec).toBe((50 - EARLY_MIN) * MIN);
  });
});

describe('formatClock', () => {
  it('오후 시각을 표시한다', () => {
    // KST 오후 2시 30분 = UTC 05:30
    expect(formatClock(Date.UTC(2026, 7, 18, 5, 30))).toBe('오후 2시 30분');
  });

  it('오전 시각을 표시한다', () => {
    // KST 오전 9시 = UTC 00:00
    expect(formatClock(Date.UTC(2026, 7, 18, 0, 0))).toBe('오전 9시');
  });

  it('정오를 표시한다', () => {
    // KST 12시 = UTC 03:00
    expect(formatClock(Date.UTC(2026, 7, 18, 3, 0))).toBe('오후 12시');
  });

  it('자정을 표시한다', () => {
    // KST 0시 = UTC 15:00 (전날)
    expect(formatClock(Date.UTC(2026, 7, 17, 15, 0))).toBe('오전 12시');
  });

  it('분이 0이면 분을 생략한다', () => {
    expect(formatClock(Date.UTC(2026, 7, 18, 6, 0))).toBe('오후 3시');
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0분'],
    [59, '1분'],
    [27 * MIN, '27분'],
    [60 * MIN, '1시간'],
    [65 * MIN, '1시간 5분'],
  ])('%i초 → %s', (sec, expected) => {
    expect(formatDuration(sec)).toBe(expected);
  });
});

/** 한국 시간으로 만든 epoch ms. 테스트가 실행 환경 시간대에 흔들리지 않게. */
function kst(y: number, mo: number, d: number, h: number, mi: number): number {
  return Date.UTC(y, mo - 1, d, h - 9, mi, 0, 0);
}

describe('resolveAppointment — 사람이 적은 시각', () => {
  /** 2026-08-20(목) 한국 시간 오후 3시. */
  const AT_3PM = kst(2026, 8, 20, 15, 0);

  it('오전/오후를 안 고르면 다가오는 쪽으로 읽는다', () => {
    // 오후 3시에 "6:30"이면 오늘 저녁이지 내일 아침이 아니다.
    const at = resolveAppointment({ hour12: 6, minute: 30, period: null }, AT_3PM);
    expect(at).toBe(kst(2026, 8, 20, 18, 30));
  });

  it('오늘 남은 게 오전뿐이면 오전으로 읽는다', () => {
    // 새벽 5시에 "8:00"이면 오늘 아침.
    const at = resolveAppointment({ hour12: 8, minute: 0, period: null }, kst(2026, 8, 20, 5, 0));
    expect(at).toBe(kst(2026, 8, 20, 8, 0));
  });

  it('둘 다 지났으면 내일 가까운 쪽으로 넘긴다', () => {
    // 밤 11시에 "8:00"이면 내일 아침.
    const at = resolveAppointment({ hour12: 8, minute: 0, period: null }, kst(2026, 8, 20, 23, 0));
    expect(at).toBe(kst(2026, 8, 21, 8, 0));
  });

  it('사람이 고른 오전/오후는 앱이 뒤집지 않는다', () => {
    // 오후 3시에 굳이 '오전 6:30'을 골랐다면 내일 아침을 뜻한다.
    const at = resolveAppointment({ hour12: 6, minute: 30, period: 'am' }, AT_3PM);
    expect(at).toBe(kst(2026, 8, 21, 6, 30));
  });

  it('12시를 0시로 접지 않는다', () => {
    expect(resolveAppointment({ hour12: 12, minute: 0, period: 'pm' }, kst(2026, 8, 20, 9, 0))).toBe(
      kst(2026, 8, 20, 12, 0)
    );
    expect(resolveAppointment({ hour12: 12, minute: 0, period: 'am' }, kst(2026, 8, 20, 9, 0))).toBe(
      kst(2026, 8, 21, 0, 0)
    );
  });

  it('지금과 같은 시각은 지난 것으로 본다', () => {
    // 딱 지금으로 약속을 잡을 수는 없다. 걸어갈 시간이 0이다.
    const at = resolveAppointment({ hour12: 3, minute: 0, period: 'pm' }, AT_3PM);
    expect(at).toBe(kst(2026, 8, 21, 15, 0));
  });

  /*
   * 오후 6시 반 약속에 "18:30"을 적는 건 아주 흔한 일이다.
   * 1~12만 받던 때는 그게 조용히 null이 되어 다음 버튼이 이유 없이 죽었다.
   */
  it('24시간으로 적어도 받는다', () => {
    expect(resolveAppointment({ hour12: 18, minute: 30, period: null }, AT_3PM)).toBe(
      kst(2026, 8, 20, 18, 30)
    );
    expect(resolveAppointment({ hour12: 23, minute: 5, period: null }, AT_3PM)).toBe(
      kst(2026, 8, 20, 23, 5)
    );
  });

  it('0시는 자정으로 읽는다', () => {
    expect(resolveAppointment({ hour12: 0, minute: 10, period: null }, AT_3PM)).toBe(
      kst(2026, 8, 21, 0, 10)
    );
  });

  it('24시간으로 적었으면 오전/오후 토글보다 적은 쪽이 이긴다', () => {
    // "18시"라고 적어 놓고 오전을 골랐다면 적은 쪽이 뜻이 분명하다.
    expect(resolveAppointment({ hour12: 18, minute: 0, period: 'am' }, AT_3PM)).toBe(
      kst(2026, 8, 20, 18, 0)
    );
  });

  it('24시간으로 적어도 지난 시각은 내일로 넘긴다', () => {
    expect(resolveAppointment({ hour12: 14, minute: 0, period: null }, AT_3PM)).toBe(
      kst(2026, 8, 21, 14, 0)
    );
  });

  it('범위를 벗어나면 null', () => {
    for (const bad of [
      { hour12: 24, minute: 0 },
      { hour12: -1, minute: 0 },
      { hour12: 6, minute: 60 },
      { hour12: 6, minute: -1 },
      { hour12: 6.5, minute: 0 },
      { hour12: NaN, minute: 0 },
    ]) {
      expect(resolveAppointment({ ...bad, period: null }, AT_3PM)).toBeNull();
    }
  });

  it('자정을 넘겨도 날짜 산술이 맞는다', () => {
    // UTC로는 이미 다음 날이지만 한국은 아직 오늘 밤이다.
    const lateNight = kst(2026, 8, 20, 23, 50);
    expect(resolveAppointment({ hour12: 11, minute: 55, period: 'pm' }, lateNight)).toBe(
      kst(2026, 8, 20, 23, 55)
    );
  });
});

describe('dayLabel — 언제로 읽혔는지 보여 준다', () => {
  const now = kst(2026, 8, 20, 15, 0);

  it('같은 날은 오늘', () => {
    expect(dayLabel(kst(2026, 8, 20, 18, 30), now)).toBe('오늘');
  });

  it('하루 뒤는 내일', () => {
    expect(dayLabel(kst(2026, 8, 21, 6, 30), now)).toBe('내일');
  });

  it('자정 직후도 한국 기준으로 센다', () => {
    // UTC 날짜로 세면 오후 3시(UTC 06:00)와 밤 11시가 같은 날로 보이지 않는다.
    expect(dayLabel(kst(2026, 8, 21, 0, 10), kst(2026, 8, 20, 23, 50))).toBe('내일');
  });
});

describe('arrivalAt', () => {
  const now = Date.UTC(2026, 7, 17, 3, 0, 0);

  it('지금 나서서 그만큼 걸으면 닿는 시각', () => {
    expect(arrivalAt(now, 27 * MIN)).toBe(now + 27 * 60_000);
  });

  /*
   * 이 앱이 화면에서 지켜야 하는 관계. 목표대로 걸으면 약속보다 그만큼 먼저 닿는다 —
   * 화면이 이 값을 그대로 적으므로, 어긋나면 사용자가 먼저 본다.
   */
  it('목표대로 걸으면 약속보다 그만큼 먼저 닿는다', () => {
    const appointment = now + 40 * 60_000;
    const plan = planWalk({ nowMs: now, arriveAtMs: appointment, shortestSec: 20 * MIN });

    expect(plan.kind).toBe('stretch');
    if (plan.kind !== 'stretch') return;

    expect(arrivalAt(now, plan.targetWalkSec)).toBe(appointment - ARRIVE_EARLY_SEC * 1000);
  });
});

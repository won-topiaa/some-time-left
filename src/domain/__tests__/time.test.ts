import { describe, expect, it } from 'vitest';
import { ARRIVE_EARLY_SEC, MAX_STRETCH_RATIO, formatClock, formatDuration, planWalk } from '../time';

const MIN = 60;

describe('planWalk', () => {
  const now = Date.UTC(2026, 7, 17, 3, 0, 0);
  const at = (minutesFromNow: number) => now + minutesFromNow * 60_000;

  it('여유가 넉넉하면 3분 전 도착에 맞춰 경로를 늘린다', () => {
    // 30분 뒤 약속, 최단 20분 → 3분 전 도착이려면 27분짜리 경로
    const plan = planWalk({ nowMs: now, arriveAtMs: at(30), shortestSec: 20 * MIN });

    expect(plan.kind).toBe('stretch');
    if (plan.kind !== 'stretch') return;
    expect(plan.targetWalkSec).toBe(27 * MIN);
    expect(plan.slackSec).toBe(7 * MIN);
    expect(plan.capped).toBe(false);
  });

  it('사용자가 말한 그 상황 — 20분 거리에 30분 남음', () => {
    const plan = planWalk({ nowMs: now, arriveAtMs: at(30), shortestSec: 20 * MIN });
    if (plan.kind !== 'stretch') throw new Error('stretch여야 한다');

    // 27분을 걸으면 약속 3분 전에 도착한다
    const arrivalMs = now + plan.targetWalkSec * 1000;
    expect(at(30) - arrivalMs).toBe(ARRIVE_EARLY_SEC * 1000);
  });

  it('여유가 1분 남짓이면 우회하지 않고 곧장 간다', () => {
    // 24분 뒤 약속, 최단 20분 → 예산 21분, 여유 1분
    const plan = planWalk({ nowMs: now, arriveAtMs: at(24), shortestSec: 20 * MIN });

    expect(plan.kind).toBe('straight');
    if (plan.kind !== 'straight') return;
    expect(plan.reason).toBe('no-slack');
  });

  it('3분 전은 못 맞추지만 정시엔 닿으면 솔직하게 곧장 가라고 한다', () => {
    // 22분 뒤 약속, 최단 20분 → 3분 전(19분 예산)에는 못 맞춤
    const plan = planWalk({ nowMs: now, arriveAtMs: at(22), shortestSec: 20 * MIN });

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
    expect(plan.targetWalkSec).toBe(47 * MIN);
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

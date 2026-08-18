import { describe, expect, it } from 'vitest';
import {
  formatRecordDate,
  formatTotalDistance,
  groupByMonth,
  traceSummary,
} from '../trace';
import type { WalkRecord } from '../types';

/** 서울 시청 근처, 대략 남북으로 111m씩 떨어진 두 점. */
const PATH = [
  { lat: 37.5665, lng: 126.978 },
  { lat: 37.5675, lng: 126.978 },
];

function record(over: Partial<WalkRecord> = {}): WalkRecord {
  return {
    id: '1',
    companion: '',
    mood: 'plain',
    note: '',
    arrivedAt: Date.UTC(2026, 7, 18, 3, 0),
    destinationName: '어딘가',
    path: PATH,
    routeId: 'r1',
    ...over,
  };
}

describe('traceSummary', () => {
  it('빈 기록은 0으로 시작한다', () => {
    expect(traceSummary([])).toEqual({
      count: 0,
      totalDistanceM: 0,
      noteCount: 0,
      firstAt: null,
    });
  });

  it('거리를 누적한다', () => {
    const summary = traceSummary([record(), record()]);
    expect(summary.count).toBe(2);
    // 한 구간이 대략 111m이므로 두 개면 220m 언저리
    expect(summary.totalDistanceM).toBeGreaterThan(200);
    expect(summary.totalDistanceM).toBeLessThan(240);
  });

  it('한 줄을 남긴 것만 센다 — 공백만 있는 건 기록이 아니다', () => {
    const summary = traceSummary([
      record({ note: '오늘은 좀 걸었다' }),
      record({ note: '   ' }),
      record({ note: '' }),
    ]);
    expect(summary.noteCount).toBe(1);
  });

  it('가장 오래된 시각을 찾는다 (입력 순서와 무관하게)', () => {
    const older = Date.UTC(2026, 0, 1);
    const summary = traceSummary([record({ arrivedAt: Date.UTC(2026, 5, 1) }), record({ arrivedAt: older })]);
    expect(summary.firstAt).toBe(older);
  });
});

describe('formatTotalDistance', () => {
  it('소수 둘째 자리까지 남긴다', () => {
    expect(formatTotalDistance(1234)).toBe('1.23');
    expect(formatTotalDistance(0)).toBe('0.00');
  });
});

describe('groupByMonth', () => {
  it('달별로 묶고 최신 달을 앞에 둔다', () => {
    const groups = groupByMonth([
      record({ id: 'a', arrivedAt: Date.UTC(2026, 5, 10, 3) }),
      record({ id: 'b', arrivedAt: Date.UTC(2026, 7, 2, 3) }),
      record({ id: 'c', arrivedAt: Date.UTC(2026, 5, 20, 3) }),
    ]);

    expect(groups.map((g) => g.key)).toEqual(['2026-08', '2026-06']);
    expect(groups[0].label).toBe('2026년 8월');
    expect(groups[1].records.map((r) => r.id)).toEqual(['c', 'a']);
  });

  it('KST 기준으로 달을 가른다 — UTC로 자르면 월말 밤이 밀린다', () => {
    // UTC로는 7월 31일 22시지만 KST로는 8월 1일 07시다.
    const groups = groupByMonth([record({ arrivedAt: Date.UTC(2026, 6, 31, 22) })]);
    expect(groups[0].key).toBe('2026-08');
  });

  it('빈 배열은 빈 묶음', () => {
    expect(groupByMonth([])).toEqual([]);
  });

  it('연말 자정을 넘겨도 해가 밀리지 않는다', () => {
    // UTC 2025-12-31 16:00 = KST 2026-01-01 01:00
    const groups = groupByMonth([record({ arrivedAt: Date.UTC(2025, 11, 31, 16) })]);
    expect(groups[0].key).toBe('2026-01');
    expect(groups[0].label).toBe('2026년 1월');
  });
});

describe('formatRecordDate', () => {
  it('월·일만 짧게', () => {
    expect(formatRecordDate(Date.UTC(2026, 7, 18, 3))).toBe('8월 18일');
  });

  it('KST 기준이다', () => {
    // UTC 7월 31일 22시 = KST 8월 1일
    expect(formatRecordDate(Date.UTC(2026, 6, 31, 22))).toBe('8월 1일');
  });
});

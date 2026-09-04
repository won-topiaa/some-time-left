import { describe, expect, it } from 'vitest';
import { sanitizeCarried, sanitizeRecord, sanitizeRecords } from '../record-schema';
import { traceSummary, groupByMonth, addToCarried } from '../../domain/trace';
import { moodById } from '../../domain/mood';
import { pathLengthM } from '../../domain/geo';
import type { WalkRecord } from '../../domain/types';

const good = (patch: Partial<WalkRecord> = {}): WalkRecord => ({
  id: 'r1',
  companion: '',
  mood: 'plain',
  note: '',
  arrivedAt: Date.UTC(2026, 0, 15),
  destinationName: '어딘가',
  path: [
    { lat: 37.5, lng: 127 },
    { lat: 37.501, lng: 127 },
  ],
  routeId: 'osrm-abc',
  ...patch,
});

describe('sanitizeRecord', () => {
  it('멀쩡한 기록은 그대로 통과한다', () => {
    const record = good({ destination: { lat: 37.5, lng: 127 }, distanceM: 111 });
    expect(sanitizeRecord(record)).toEqual(record);
  });

  it('시각이 없으면 버린다 — 모든 화면이 시각으로 묶는다', () => {
    expect(sanitizeRecord({ ...good(), arrivedAt: undefined })).toBeNull();
    expect(sanitizeRecord({ ...good(), arrivedAt: NaN })).toBeNull();
    expect(sanitizeRecord({ ...good(), arrivedAt: '2026-01-15' })).toBeNull();
    expect(sanitizeRecord(null)).toBeNull();
    expect(sanitizeRecord('기록')).toBeNull();
  });

  it('모르는 기분은 중립으로 앉힌다 — moodById가 던지지 않게', () => {
    const fixed = sanitizeRecord({ ...good(), mood: 'furious' })!;
    expect(fixed.mood).toBe('plain');
    expect(() => moodById(fixed.mood)).not.toThrow();
  });

  it('없는 문자열 칸은 빈 문자열이 된다 — .trim()을 부르는 곳이 여럿이다', () => {
    const fixed = sanitizeRecord({ arrivedAt: 1, mood: 'plain' })!;
    expect(fixed.note).toBe('');
    expect(fixed.companion).toBe('');
    expect(fixed.destinationName).toBe('');
    expect(fixed.routeId).toBe('');
    expect(() => fixed.note.trim()).not.toThrow();
  });

  it('id가 없으면 시각으로 하나 만든다 — 버리지 않는다', () => {
    expect(sanitizeRecord({ arrivedAt: 42 })!.id).toBe('record-42');
  });

  it('좌표가 없거나 상했으면 빈 길로 둔다', () => {
    expect(sanitizeRecord({ arrivedAt: 1, path: undefined })!.path).toEqual([]);
    expect(sanitizeRecord({ arrivedAt: 1, path: '어딘가' })!.path).toEqual([]);
  });

  it('길 안의 못 쓰는 점만 골라 뺀다 — NaN 하나가 누적 거리를 통째로 삼킨다', () => {
    const fixed = sanitizeRecord({
      arrivedAt: 1,
      path: [
        { lat: 37.5, lng: 127 },
        { lat: NaN, lng: 127 },
        null,
        { lat: 37.501, lng: 127 },
      ],
    })!;
    expect(fixed.path).toHaveLength(2);
    expect(Number.isFinite(pathLengthM(fixed.path))).toBe(true);
  });

  it('지구 밖 좌표는 빼낸다 — 숫자이긴 해도 거리를 지구 몇 바퀴로 만든다', () => {
    const fixed = sanitizeRecord({
      arrivedAt: 1,
      path: [{ lat: 900, lng: 127 }, { lat: 37.5, lng: 4000 }],
      destination: { lat: 91, lng: 127 },
    })!;
    expect(fixed.path).toEqual([]);
    expect(fixed.destination).toBeUndefined();
  });

  it('없는 값은 키까지 만들지 않는다 — 옛 기록과 구분이 안 된다', () => {
    const fixed = sanitizeRecord({ arrivedAt: 1 })!;
    expect('destination' in fixed).toBe(false);
    expect('distanceM' in fixed).toBe(false);
  });

  it('상한 거리는 버리고 좌표에서 다시 재게 둔다', () => {
    expect(sanitizeRecord({ arrivedAt: 1, distanceM: -5 })!.distanceM).toBeUndefined();
    expect(sanitizeRecord({ arrivedAt: 1, distanceM: NaN })!.distanceM).toBeUndefined();
    expect(sanitizeRecord({ arrivedAt: 1, distanceM: 0 })!.distanceM).toBe(0);
  });
});

describe('sanitizeRecords', () => {
  it('배열이 아니면 빈 목록', () => {
    expect(sanitizeRecords(null)).toEqual([]);
    expect(sanitizeRecords({ records: [] })).toEqual([]);
  });

  it('한 줄이 상해도 나머지는 지킨다', () => {
    const list = sanitizeRecords([good({ id: 'a' }), null, good({ id: 'b' })]);
    expect(list.map((r) => r.id)).toEqual(['a', 'b']);
  });

  /**
   * 이 테스트가 이 파일의 이유다.
   *
   * '지나온 길'은 `traceSummary`·`groupByMonth`를 **렌더 중에** 부른다. 거기서
   * 던지면 _app.tsx의 ErrorBoundary까지 올라가 앱 전체가 "시작하지 못했어요"가
   * 되고, 저장소를 지우기 전에는 다시 열어도 같은 화면이다.
   * 기록 한 줄이 앱을 영영 못 열게 만들면 안 된다.
   */
  it('저장소가 어떤 쓰레기를 내놔도 화면 계산이 던지지 않는다', () => {
    const junk = [
      null,
      undefined,
      42,
      '기록',
      [],
      {},
      { arrivedAt: 1 },
      { arrivedAt: 2, mood: 'furious', note: null, path: null },
      { arrivedAt: 3, path: [{ lat: 'x', lng: {} }], distanceM: 'far' },
      { arrivedAt: NaN, note: '버려질 줄' },
      good({ id: 'ok' }),
    ];
    const records = sanitizeRecords(junk);

    expect(() => traceSummary(records, sanitizeCarried(null))).not.toThrow();
    expect(() => groupByMonth(records)).not.toThrow();
    expect(() => addToCarried(sanitizeCarried(null), records)).not.toThrow();
    for (const record of records) {
      expect(() => moodById(record.mood)).not.toThrow();
    }

    const summary = traceSummary(records, sanitizeCarried(null));
    expect(Number.isFinite(summary.totalDistanceM)).toBe(true);
    // 'NaN년 NaN월' 묶음이 생기지 않는다.
    expect(groupByMonth(records).every((m) => !m.key.includes('NaN'))).toBe(true);
    // 시각 없는 한 줄만 빠지고 나머지는 살아남았다.
    expect(records.map((r) => r.id)).toContain('ok');
  });
});

describe('sanitizeCarried', () => {
  it('멀쩡한 합은 그대로', () => {
    const carried = { count: 3, distanceM: 4200, noteCount: 1 };
    expect(sanitizeCarried(carried)).toEqual(carried);
  });

  it('상한 칸만 0으로 둔다 — 몇 년치 누적 거리를 한 번에 지우지 않는다', () => {
    expect(sanitizeCarried({ count: 3, distanceM: 4200, noteCount: null })).toEqual({
      count: 3,
      distanceM: 4200,
      noteCount: 0,
    });
  });

  it('없거나 아닌 것은 0', () => {
    expect(sanitizeCarried(null)).toEqual({ count: 0, distanceM: 0, noteCount: 0 });
    expect(sanitizeCarried('합')).toEqual({ count: 0, distanceM: 0, noteCount: 0 });
    expect(sanitizeCarried({ count: NaN, distanceM: -1, noteCount: 2 })).toEqual({
      count: 0,
      distanceM: 0,
      noteCount: 2,
    });
  });
});

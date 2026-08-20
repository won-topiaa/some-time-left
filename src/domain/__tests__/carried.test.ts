import { describe, expect, it } from 'vitest';
import { NO_CARRIED, addToCarried, traceSummary } from '../trace';
import type { WalkRecord } from '../types';

/**
 * 400건이 넘으면 낱낱은 버리고 합만 남긴다. 그 과정에서 **누적 숫자가 흔들리면 안 된다** —
 * '지나온 길'의 주인공이 그 숫자이고, 오래된 걸 지웠다고 걸은 거리가 줄거나 늘면
 * 이 화면을 기록이라고 부를 수 없다.
 */
function record(over: Partial<WalkRecord> = {}): WalkRecord {
  return {
    id: '1',
    companion: '',
    mood: 'plain',
    note: '',
    arrivedAt: Date.UTC(2026, 7, 18, 3, 0),
    destinationName: '어딘가',
    path: [],
    routeId: 'r1',
    distanceM: 1000,
    ...over,
  };
}

describe('addToCarried', () => {
  it('버릴 게 없으면 그대로 둔다', () => {
    const base = { count: 3, distanceM: 500, noteCount: 1 };
    expect(addToCarried(base, [])).toBe(base);
  });

  it('개수·거리·한 줄 수를 모두 더한다', () => {
    const next = addToCarried(NO_CARRIED, [
      record({ distanceM: 1000, note: '좋았다' }),
      record({ distanceM: 2000, note: '' }),
      record({ distanceM: 500, note: '  ' }),
    ]);

    expect(next).toEqual({ count: 3, distanceM: 3500, noteCount: 1 });
  });

  it('참값이 없는 옛 기록은 좌표에서 잰다', () => {
    const path = [
      { lat: 37.5665, lng: 126.978 },
      { lat: 37.5675, lng: 126.978 },
    ];
    const next = addToCarried(NO_CARRIED, [record({ distanceM: undefined, path })]);
    expect(next.distanceM).toBeGreaterThan(100);
    expect(next.distanceM).toBeLessThan(120);
  });

  it('여러 번 넘쳐도 합이 어긋나지 않는다', () => {
    // 다섯 번에 걸쳐 두 건씩 밀려난 상황
    let carried = NO_CARRIED;
    for (let i = 0; i < 5; i += 1) {
      carried = addToCarried(carried, [
        record({ distanceM: 100, note: 'x' }),
        record({ distanceM: 200 }),
      ]);
    }
    expect(carried).toEqual({ count: 10, distanceM: 1500, noteCount: 5 });
  });

  it('밀려나도 전체 누적은 그대로다', () => {
    // 열 건을 걸었고, 그중 넷이 목록에서 밀려났다고 하자.
    const all = Array.from({ length: 10 }, (_, i) =>
      record({ id: `${i}`, distanceM: 1000, note: i % 2 === 0 ? '한 줄' : '' })
    );
    const kept = all.slice(0, 6);
    const dropped = all.slice(6);

    const whole = traceSummary(all);
    const split = traceSummary(kept, addToCarried(NO_CARRIED, dropped));

    expect(split.count).toBe(whole.count);
    expect(split.totalDistanceM).toBe(whole.totalDistanceM);
    expect(split.noteCount).toBe(whole.noteCount);
  });
});

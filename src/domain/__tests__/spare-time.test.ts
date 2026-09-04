import { describe, expect, it } from 'vitest';
import { canWalk, spareSpan } from '../spare-time';
import { ARRIVE_EARLY_SEC, COMFORTABLE_WALK_SEC } from '../time';

const MIN = 60;
const now = Date.UTC(2026, 8, 4, 3, 0);
const inMinutes = (m: number) => now + m * MIN * 1000;

describe('spareSpan', () => {
  it('세 도막을 더하면 지금부터 약속까지다', () => {
    const span = spareSpan(now, inMinutes(37), ARRIVE_EARLY_SEC)!;
    expect(span.waitSec + span.walkSec + span.bufferSec).toBe(span.totalSec);
    expect(span.totalSec).toBe(37 * MIN);
  });

  it('여유가 상한 안이면 기다리지 않는다 — 지금 나서서 다 걷는다', () => {
    // 상도동에서 실기기로 나온 그 장면: 약속까지 37분.
    const span = spareSpan(now, inMinutes(37), ARRIVE_EARLY_SEC)!;
    expect(span.waitSec).toBe(0);
    expect(span.walkSec).toBe(32 * MIN);
    expect(span.bufferSec).toBe(ARRIVE_EARLY_SEC);
  });

  /*
   * 그림이 다음 화면과 다른 말을 하면 안 된다. 계획은 `planWalk`에서 상한에
   * 걸려 잘리므로, 여섯 시간이 비었다고 "355분을 걷는다"고 그리면 화면이
   * 앱보다 큰 약속을 하게 된다.
   */
  it('여유가 상한을 넘으면 걷는 도막은 상한에서 멈추고 나머지는 기다림이 된다', () => {
    const span = spareSpan(now, inMinutes(6 * 60), ARRIVE_EARLY_SEC)!;
    expect(span.walkSec).toBe(COMFORTABLE_WALK_SEC);
    expect(span.waitSec).toBeGreaterThan(0);
    expect(span.waitSec + span.walkSec + span.bufferSec).toBe(span.totalSec);
  });

  it('비 오는 날은 여백이 그만큼 넓다', () => {
    const dry = spareSpan(now, inMinutes(37), ARRIVE_EARLY_SEC)!;
    const wet = spareSpan(now, inMinutes(37), 7 * MIN)!;
    expect(wet.bufferSec).toBeGreaterThan(dry.bufferSec);
    expect(wet.walkSec).toBeLessThan(dry.walkSec);
  });

  it('약속이 여백보다 가까우면 걸을 자리가 없다', () => {
    const span = spareSpan(now, inMinutes(2), ARRIVE_EARLY_SEC)!;
    expect(span.walkSec).toBe(0);
    expect(span.waitSec).toBe(0);
    // 여백이 남은 시간을 넘지 않는다 — 넘으면 합이 안 맞는다.
    expect(span.bufferSec).toBe(2 * MIN);
    expect(canWalk(span)).toBe(false);
  });

  it('약속이 이미 지났거나 지금이면 그릴 것이 없다', () => {
    expect(spareSpan(now, now, ARRIVE_EARLY_SEC)).toBeNull();
    expect(spareSpan(now, inMinutes(-10), ARRIVE_EARLY_SEC)).toBeNull();
  });

  it('숫자가 아닌 값에는 선을 그리지 않는다', () => {
    expect(spareSpan(NaN, inMinutes(30), ARRIVE_EARLY_SEC)).toBeNull();
    expect(spareSpan(now, NaN, ARRIVE_EARLY_SEC)).toBeNull();
    expect(spareSpan(now, inMinutes(30), NaN)).toBeNull();
  });

  it('세 도막 모두 음수가 아니다 — 화면이 flex로 그대로 늘어놓는다', () => {
    for (const minutes of [1, 3, 5, 10, 37, 60, 120, 600]) {
      const span = spareSpan(now, inMinutes(minutes), ARRIVE_EARLY_SEC);
      if (span == null) continue;
      expect(span.waitSec).toBeGreaterThanOrEqual(0);
      expect(span.walkSec).toBeGreaterThanOrEqual(0);
      expect(span.bufferSec).toBeGreaterThanOrEqual(0);
    }
  });
});

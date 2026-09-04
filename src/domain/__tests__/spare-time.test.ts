import { describe, expect, it } from 'vitest';
import { canWalk, isFloor, spareSpan } from '../spare-time';
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

  /*
   * 화면은 분 단위로 적는다. 초로만 따지면 5초짜리도 '걸을 수 있다'가 되어
   * "0분을 걸을 수 있어요"가 뜬다 — 그 문장은 안 나오기로 한 문장이다.
   */
  it('1분도 안 되는 여유는 걸을 자리로 치지 않는다', () => {
    // 약속 5분 10초 뒤, 맑은 날 여백 5분 → 걸을 수 있는 건 10초뿐이다.
    const sliver = spareSpan(now, now + 310 * 1000, ARRIVE_EARLY_SEC)!;
    expect(sliver.walkSec).toBe(10);
    expect(canWalk(sliver)).toBe(false);

    // 딱 1분부터는 걷는다.
    const minute = spareSpan(now, now + (ARRIVE_EARLY_SEC + 60) * 1000, ARRIVE_EARLY_SEC)!;
    expect(minute.walkSec).toBe(60);
    expect(canWalk(minute)).toBe(true);
  });

  it('화면에 적히는 분이 0이면 걸을 자리도 없다', () => {
    // 반올림해서 0분이 되는 구간 전체를 훑는다. 하나라도 통과하면 "0분" 문장이 뜬다.
    for (let extra = 1; extra < 30; extra += 1) {
      const span = spareSpan(now, now + (ARRIVE_EARLY_SEC + extra) * 1000, ARRIVE_EARLY_SEC)!;
      if (Math.round(span.walkSec / 60) === 0) {
        expect(canWalk(span)).toBe(false);
      }
    }
  });
});

/*
 * `planWalk`의 상한은 배율과 절대값 중 큰 쪽인데, 첫 화면은 최단 경로를 모른다.
 * 그래서 이 그림은 정확한 예고가 아니라 아래로 잡은 값이고, 화면은 그 사실대로
 * "N분 이상"이라고 말해야 한다.
 */
describe('isFloor — 더 걷게 될 수도 있는 날', () => {
  it('상한에 걸리면 참 — 화면은 "이상"이라고 말한다', () => {
    const span = spareSpan(now, inMinutes(6 * 60), ARRIVE_EARLY_SEC)!;
    expect(span.waitSec).toBeGreaterThan(0);
    expect(isFloor(span)).toBe(true);
  });

  it('예산을 다 걷는 날은 거짓 — 그때는 딱 잘라 말해도 된다', () => {
    const span = spareSpan(now, inMinutes(37), ARRIVE_EARLY_SEC)!;
    expect(span.waitSec).toBe(0);
    expect(isFloor(span)).toBe(false);
  });

  it('걸을 자리가 없는 날은 "이상"도 아니다', () => {
    const span = spareSpan(now, inMinutes(2), ARRIVE_EARLY_SEC)!;
    expect(isFloor(span)).toBe(false);
    expect(canWalk(span)).toBe(false);
  });
});

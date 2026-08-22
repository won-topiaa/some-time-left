import { describe, expect, it } from 'vitest';
import { aimSec } from '../tmap-route-provider';
import { ARRIVE_EARLY_SEC, PROMISE_FLOOR_SEC } from '../../domain/time';
import { arrivesOnTime } from '../../domain/route-plan';

const MIN = 60;

/**
 * 후보를 만들 때 목표를 정확히 겨누면 결과가 목표 위아래로 흩어지고, 위로 벗어난
 * 것들이 문턱에서 버려진다. 실기기에서 그게 이렇게 나타났다 —
 * 기분을 무엇으로 골라도 늘 같은 길(최단 경로) 하나만 나오고,
 * 화면은 "딱 맞는 길이 없었어요"만 반복했다.
 */
describe('aimSec — 목표보다 조금 밑을 겨눈다', () => {
  it('항상 목표보다 짧다', () => {
    for (const target of [10 * MIN, 27 * MIN, 44 * MIN, 90 * MIN]) {
      expect(aimSec(target)).toBeLessThan(target);
    }
  });

  it('짧은 길에서도 겨냥이 의미를 갖는다', () => {
    // 비율만 쓰면 5분짜리 길에서 15초밖에 안 내려간다. 최소 폭이 그걸 막는다.
    expect(5 * MIN - aimSec(5 * MIN)).toBeGreaterThanOrEqual(45);
  });

  it('긴 길에서는 비율만큼 내려간다', () => {
    expect(aimSec(60 * MIN)).toBeCloseTo(60 * MIN * 0.95, 6);
  });

  it('음수로 내려가지 않는다', () => {
    expect(aimSec(10)).toBeGreaterThanOrEqual(0);
  });

  /*
   * 이 테스트가 이 파일의 이유다. 겨눈 자리를 중심으로 흩어진 길들이 실제로
   * 문턱을 통과해야 후보가 남는다. 도로망 오차는 겨눈 자리보다 **위로** 몰리므로
   * (경유지는 우리 보행 속도로 찍는데 도보 API는 대체로 더 걸린다고 답한다),
   * 위쪽으로 넉넉히 벗어나도 통과하는지가 관건이다.
   */
  it('겨눈 자리에서 흩어져도 문턱을 통과한다', () => {
    const target = 44 * MIN;
    const aim = aimSec(target);
    const slack = ARRIVE_EARLY_SEC - PROMISE_FLOOR_SEC;

    // 겨눈 자리보다 2분 더 걸려도 받아 준다.
    expect(arrivesOnTime(aim + 2 * MIN, target)).toBe(true);
    // 겨눈 자리 그대로도, 조금 짧아도 물론 받는다.
    expect(arrivesOnTime(aim, target)).toBe(true);
    expect(arrivesOnTime(aim - 2 * MIN, target)).toBe(true);
    // 바닥 너머는 받지 않는다 — 그건 약속에 늦는다.
    expect(arrivesOnTime(target + slack + 1, target)).toBe(false);
  });
});

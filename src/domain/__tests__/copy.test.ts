import { describe, expect, it } from 'vitest';
import { alongRouteHint, arrivalPrompt, memoryRecall, planHeadline, routeReason } from '../copy';
import { MOODS } from '../mood';
import { FEATURE_KEYS } from '../types';

/**
 * 이 한 줄이 자동 추천의 생명줄이라, 여섯 기분 × 여섯 성질을 전부 통과시킨다.
 * 예전에 라벨을 정규식으로 활용시켰다가 셋이 비문이 됐다 —
 * 그 회귀를 막는 것이 이 파일의 존재 이유다.
 */
describe('routeReason', () => {
  it('여섯 기분 × 여섯 성질이 모두 문장이 된다', () => {
    for (const mood of MOODS) {
      for (const feature of FEATURE_KEYS) {
        const sentence = routeReason(mood.id, feature);
        expect(sentence).toContain('다고 하셔서,');
        expect(sentence.endsWith('.')).toBe(true);
      }
    }
  });

  it('정규식 활용이 만들던 비문이 하나도 남아 있지 않다', () => {
    // '많아다고' '돼다고' '그래다고' '설레다고' — 전부 옛 버그의 흔적이다.
    const broken = /(아다고|애다고|래다고|돼다고|설레다고|어다고)/;
    for (const mood of MOODS) {
      expect(routeReason(mood.id, 'quiet')).not.toMatch(broken);
    }
  });

  it('기분마다 제 인용형을 쓴다', () => {
    expect(routeReason('pensive', 'quiet')).toBe('생각이 많다고 하셔서, 사람이 거의 없는 길이에요.');
    expect(routeReason('hot', 'shade')).toBe(
      '햇볕이 싫다고 하셔서, 이 시간엔 그늘이 이어지는 길이에요.'
    );
    expect(routeReason('plain', 'novelty')).toBe('그냥 그렇다고 하셔서, 아직 안 가보신 길이에요.');
  });
});

describe('arrivalPrompt', () => {
  it('상대가 없으면 혼자 있는 말투로', () => {
    expect(arrivalPrompt(null)).toContain('첫 마디');
    expect(arrivalPrompt('   ')).toContain('첫 마디');
  });

  it('상대가 있으면 이름을 부른다', () => {
    expect(arrivalPrompt('민수')).toContain('민수에게');
  });
});

describe('planHeadline', () => {
  it('늘리는 계획은 목표 시간을 말한다', () => {
    expect(
      planHeadline({ kind: 'stretch', targetWalkSec: 27 * 60, slackSec: 420, capped: false })
    ).toContain('27분');
  });

  it('여유가 과하면 다른 말을 한다', () => {
    expect(
      planHeadline({ kind: 'stretch', targetWalkSec: 44 * 60, slackSec: 4000, capped: true })
    ).toContain('넉넉히');
  });

  it('곧장 가는 두 이유를 구분한다', () => {
    const noEarly = planHeadline({ kind: 'straight', reason: 'no-early', targetWalkSec: 1200 });
    const noSlack = planHeadline({ kind: 'straight', reason: 'no-slack', targetWalkSec: 1200 });
    expect(noEarly).not.toBe(noSlack);
    expect(noEarly).toContain('3분 전은 어렵겠어요');
  });

  it('늦으면 얼마나 늦는지 말한다', () => {
    expect(planHeadline({ kind: 'too-late', shortBySec: 300 })).toContain('5분');
  });
});

describe('memoryRecall', () => {
  it.each([
    [0, '오늘'],
    [1, '어제'],
    [5, '5일 전'],
    [60, '2달 전'],
  ])('%i일 전 → %s', (days, expected) => {
    expect(memoryRecall('좋았다', days)).toContain(expected);
  });
});

describe('alongRouteHint', () => {
  it('권하지 않고 곁에 있다고만 말한다', () => {
    const hint = alongRouteHint('연희동 커피');
    expect(hint).toContain('연희동 커피');
    // 느낌표로 재촉하지 않는다.
    expect(hint).not.toContain('!');
  });
});

import { describe, expect, it } from 'vitest';
import {
  alongRouteHint,
  arrivalPrompt,
  memoryRecall,
  planHeadline,
  postscriptLines,
  promiseLine,
  routeReason,
  walkFootnote,
  walkShareText,
} from '../copy';
import { MOODS, dominantFeature, weightsFor } from '../mood';
import { FEATURE_KEYS } from '../types';
import { ARRIVE_EARLY_SEC, WET_ARRIVE_EARLY_SEC, promisedMinutes } from '../time';

/** 화면이 말하는 숫자 — 겨눈 5가 아니라 지킬 수 있는 3. */
const ARRIVE_EARLY_MIN = promisedMinutes(ARRIVE_EARLY_SEC);

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
  it('늘리는 계획은 약속을 말한다 — 시간은 아래 큰 숫자가 말하므로 되풀이하지 않는다', () => {
    const headline = planHeadline({
      kind: 'stretch',
      targetWalkSec: 27 * 60,
      slackSec: 420,
      capped: false,
      earlySec: ARRIVE_EARLY_SEC,
    });
    expect(headline).toContain(`${ARRIVE_EARLY_MIN}분 전`);
    // 같은 화면에 27분이 두 번 나오면 주인공이 둘이 된다.
    expect(headline).not.toContain('27분');
  });

  it('여유가 과하면 다른 말을 한다', () => {
    expect(
      planHeadline({
        kind: 'stretch',
        targetWalkSec: 44 * 60,
        slackSec: 4000,
        capped: true,
        earlySec: ARRIVE_EARLY_SEC,
      })
    ).toContain('넉넉히');
  });

  it('곧장 가는 두 이유를 구분한다', () => {
    const noEarly = planHeadline({
      kind: 'straight',
      reason: 'no-early',
      targetWalkSec: 1200,
      earlySec: ARRIVE_EARLY_SEC,
    });
    const noSlack = planHeadline({
      kind: 'straight',
      reason: 'no-slack',
      targetWalkSec: 1200,
      earlySec: ARRIVE_EARLY_SEC,
    });
    expect(noEarly).not.toBe(noSlack);
    expect(noEarly).toContain(`${ARRIVE_EARLY_MIN}분 전은 어렵겠어요`);
  });

  it('맑은 날은 겨눈 5분이 아니라 지킬 수 있는 3분을 말한다', () => {
    expect(ARRIVE_EARLY_MIN).toBe(3);
    expect(
      planHeadline({ kind: 'stretch', targetWalkSec: 27 * 60, slackSec: 420, capped: false, earlySec: ARRIVE_EARLY_SEC })
    ).toBe('3분 전에는 닿는 길이에요.');
  });

  /*
   * 비 오는 날 계획은 7분을 겨누고 5분 전을 지킨다. 화면은 그 두 숫자를 **말하지 않는다** —
   * 늘 보던 3분을 기준으로 "그보다 조금 더 일찍"이라고만 한다. 숫자가 어느 날 5로
   * 달라져 있으면 앱이 틀린 것처럼 보이고, 우산 든 사람에게 필요한 건 정확한 분이 아니라
   * 여유를 더 뒀다는 사실이다.
   */
  it('비 오는 날은 늘 보던 3분을 기준으로 말한다 — 5도 7도 새어 나오지 않는다', () => {
    const wet = planHeadline({
      kind: 'stretch',
      targetWalkSec: 27 * 60,
      slackSec: 420,
      capped: false,
      earlySec: WET_ARRIVE_EARLY_SEC,
    });
    expect(wet).toBe('비 오는 날이라, 3분보다 조금 더 일찍 닿는 길이에요.');
    // 겨눈 값(7)도 그날의 바닥(5)도 화면에 나오지 않는다.
    expect(wet).not.toMatch(/[57]분/);
    expect(
      planHeadline({
        kind: 'straight',
        reason: 'no-early',
        targetWalkSec: 1200,
        earlySec: WET_ARRIVE_EARLY_SEC,
      })
    ).toBe('비 오는 날인데 여유가 없네요. 오늘은 그냥 곧장 가요.');
  });

  it('늦으면 얼마나 늦는지 말한다 — "몇 분 전"의 숫자가 아니라 늦는 만큼을', () => {
    // 5분으로 두면 ARRIVE_EARLY_MIN과 구별이 안 된다. 4분이어야 늦는 만큼을 말한 것이 보인다.
    expect(planHeadline({ kind: 'too-late', shortBySec: 240 })).toBe('최단으로 가도 4분 늦어요.');
  });
});

describe('promiseLine — 첫 화면의 약속', () => {
  it('맑은 날, 못 읽은 날은 3분 — 겨눈 5분이 아니라 지킬 수 있는 숫자', () => {
    expect(promiseLine(null)).toBe('약속 3분 전에 도착하게 해드릴게요.');
    expect(promiseLine({ tempC: 20, sky: 'clear', precip: 'none' })).toBe(
      '약속 3분 전에 도착하게 해드릴게요.'
    );
  });

  it('비 오는 날도 기준은 3분 — 이유와 "약속"은 남고, 5·7은 안 나온다', () => {
    const line = promiseLine({ tempC: 18, sky: 'cloudy', precip: 'rain' });
    expect(line).toBe('비 오는 날이라, 약속 3분 전보다 조금 더 일찍 도착하게 해드릴게요.');
    expect(line).not.toMatch(/[57]분/);
  });

  it.each([
    ['shower', '비'],
    ['thunder', '비'],
    ['sleet', '진눈깨비'],
    ['snow', '눈'],
  ] as const)('%s → "%s 오는 날"', (precip, noun) => {
    expect(promiseLine({ tempC: 0, sky: 'cloudy', precip })).toBe(
      `${noun} 오는 날이라, 약속 3분 전보다 조금 더 일찍 도착하게 해드릴게요.`
    );
  });

  it('상한에서 잘린 비 오는 날의 헤드라인은 여전히 "넉넉히"다', () => {
    expect(
      planHeadline({
        kind: 'stretch',
        targetWalkSec: 44 * 60,
        slackSec: 4000,
        capped: true,
        earlySec: WET_ARRIVE_EARLY_SEC,
      })
    ).toContain('넉넉히');
  });
});

describe('postscriptLines — 첫 화면의 추신', () => {
  it('그 상황에서 시작한다 — 일찍 와 버려 애매하게 남은 시간', () => {
    const [first] = postscriptLines();
    expect(first).toContain('일찍 와 버린');
    expect(first).toContain('카페에 들어가기엔 애매');
  });

  it('숫자는 지킬 수 있는 3이고, 비 오는 날은 숫자 없이 "조금 더 일찍"', () => {
    const text = postscriptLines().join('\n');
    expect(text).toContain(`약속 ${promisedMinutes(ARRIVE_EARLY_SEC)}분 전에는 닿는`);
    expect(text).toContain('비 오는 날은 3분보다 조금 더 일찍');
    expect(text).not.toContain('5분');
    expect(text).not.toContain('7분');
  });

  it('기능 목록이 아니라 문단 몇 개다 — 빈 줄 없이, 다섯 문단 안에서', () => {
    const lines = postscriptLines();
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(lines.length).toBeLessThanOrEqual(5);
    for (const line of lines) {
      expect(line.trim()).not.toBe('');
      // 문단마다 마침표로 끝난다 — 편지의 문장이지 항목이 아니다.
      expect(line.trim().endsWith('.') || line.trim().endsWith('요.')).toBe(true);
    }
    // 같은 문단이 둘 있으면 key가 겹쳐 화면이 경고를 낸다.
    expect(new Set(lines).size).toBe(lines.length);
  });
});

describe('walkFootnote — 걷는 화면 맨 아래', () => {
  const base = { destinationName: '', promiseHeld: false, arrivesEarly: false };

  it('맞추고 있는 날은 지킬 수 있는 숫자(3)를, 비 오는 날은 "조금 더 일찍"을 말한다', () => {
    expect(walkFootnote({ ...base, promiseHeld: true, earlySec: ARRIVE_EARLY_SEC })).toBe(
      '3분 전에는 닿도록 맞추고 있어요.'
    );
    expect(walkFootnote({ ...base, promiseHeld: true, earlySec: WET_ARRIVE_EARLY_SEC })).toBe(
      '비 오는 날이라 3분보다 조금 더 일찍 닿도록 맞추고 있어요.'
    );
  });

  it('일찍 닿는 계획과 포기한 계획은 숫자를 말하지 않는다', () => {
    expect(walkFootnote({ ...base, arrivesEarly: true, earlySec: WET_ARRIVE_EARLY_SEC })).toBe(
      '넉넉히 걷고 있어요.'
    );
    expect(walkFootnote({ ...base, earlySec: WET_ARRIVE_EARLY_SEC })).toBe('제시간에 닿도록 걷고 있어요.');
  });

  it('목적지 이름이 있으면 앞에 붙는다', () => {
    expect(
      walkFootnote({ destinationName: '성수', promiseHeld: true, arrivesEarly: false, earlySec: ARRIVE_EARLY_SEC })
    ).toBe('성수까지 3분 전에는 닿도록 맞추고 있어요.');
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

/**
 * 추천 이유는 이 길이 **실제로 가진** 성질이어야 한다.
 *
 * 데이터를 못 받은 성질은 중립값 0.5로 두는데, 가중치가 큰 기분에서는 그 0.5가
 * 그대로 최대 기여가 되어 "모르는 것"을 이유로 내세우게 됐다 —
 * 건물 높이가 하나도 없는데 '햇볕이 싫어요'에 그늘을 이유로 대던 경우다.
 */
describe('dominantFeature — 모르는 걸 이유로 대지 않는다', () => {
  const unknown = { quiet: 0.5, flat: 0.8, shade: 0.5, scenic: 0.5, novelty: 1, unbroken: 0.9 };

  it('중립값뿐인 성질은 이유가 되지 않는다', () => {
    expect(dominantFeature(unknown, weightsFor('hot'))).not.toBe('shade');
  });

  it('진짜로 그늘진 길이면 그늘을 이유로 댄다', () => {
    const shady = { ...unknown, shade: 0.9 };
    expect(dominantFeature(shady, weightsFor('hot'))).toBe('shade');
  });

  it('두드러진 게 하나도 없으면 아무것도 고르지 않는다', () => {
    /*
     * 예전엔 여기서 가중치가 가장 큰 성질을 그냥 골랐다. 전부 중립값(0.5)이라는 건
     * **하나도 재보지 못했다**는 뜻인데, 그 상태로 '생각이 많아요'를 고르면
     * unbroken이 뽑혀 "신호에 거의 안 걸리는 길이에요"라고 말했다 — 횡단보도를
     * 세어 보지도 않고. 이유가 한 줄 비는 편이 낫다.
     */
    const flat = { quiet: 0.5, flat: 0.5, shade: 0.5, scenic: 0.5, novelty: 0.5, unbroken: 0.5 };
    expect(dominantFeature(flat, weightsFor('pensive'))).toBeNull();
  });

  it('여섯 기분 모두, 두드러진 성질이 있으면 이유를 낸다', () => {
    for (const mood of MOODS) {
      // `unknown`은 flat 0.8 · novelty 1 · unbroken 0.9가 재져 있다.
      expect(FEATURE_KEYS).toContain(dominantFeature(unknown, weightsFor(mood.id)));
    }
  });
});

describe('walkShareText — 남에게 보내는 한 덩어리', () => {
  const base = {
    destinationName: '성수역 3번 출구',
    companion: '',
    mood: 'pensive' as const,
    note: '',
  };

  it('어디까지 얼마나 걸었는지 말한다', () => {
    const text = walkShareText(base, 2430);
    expect(text).toContain('성수역 3번 출구');
    expect(text).toContain('2.43km');
  });

  it('만난 사람이 있으면 그 사람이 먼저 온다', () => {
    expect(walkShareText({ ...base, companion: '지수' }, 1000)).toContain('지수 만나러');
  });

  /* 남긴 한 줄이 있으면 그게 주인공이다 — 화면에서 그랬던 것과 같다. */
  it('남긴 한 줄을 그대로 싣는다', () => {
    const text = walkShareText({ ...base, note: '바람이 좋았다' }, 1000);
    expect(text).toContain('"바람이 좋았다"');
  });

  it('한 줄이 없으면 빈 따옴표를 넣지 않는다', () => {
    expect(walkShareText(base, 1000)).not.toContain('""');
  });

  it('목적지 이름이 없어도 문장이 된다', () => {
    expect(walkShareText({ ...base, destinationName: '' }, 1000)).toContain('어딘가까지');
  });

  it('어느 기분이든 끝에 그날의 기분이 붙는다', () => {
    for (const mood of MOODS) {
      const text = walkShareText({ ...base, mood: mood.id }, 1000);
      expect(text).toContain(mood.label);
    }
  });
});

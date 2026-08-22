import { describe, expect, it } from 'vitest';
import { weightsFor } from '../mood';
import { arrivesOnTime, durationFit, firstRoute, nextRoute, rankRoutes } from '../route-plan';
import { ARRIVE_EARLY_SEC, PROMISE_FLOOR_SEC } from '../time';
import type { RouteCandidate, RouteFeatures } from '../types';

const MIN = 60;

function features(overrides: Partial<RouteFeatures> = {}): RouteFeatures {
  return {
    quiet: 0.5,
    flat: 0.5,
    shade: 0.5,
    scenic: 0.5,
    novelty: 0.5,
    unbroken: 0.5,
    ...overrides,
  };
}

function candidate(
  id: string,
  durationSec: number,
  featureOverrides: Partial<RouteFeatures> = {}
): RouteCandidate {
  return {
    id,
    durationSec,
    distanceM: durationSec * 1.25,
    features: features(featureOverrides),
    path: [],
    segments: [],
  };
}

describe('durationFit', () => {
  it('정확히 맞으면 1', () => {
    expect(durationFit(27 * MIN, 27 * MIN)).toBe(1);
  });

  it('늦는 쪽이 이른 쪽보다 가혹하다', () => {
    const late = durationFit(27 * MIN + 120, 27 * MIN);
    const early = durationFit(27 * MIN - 120, 27 * MIN);

    expect(late).toBeLessThan(early);
  });

  it('많이 늦으면 사실상 탈락한다', () => {
    expect(durationFit(32 * MIN, 27 * MIN)).toBeLessThan(0.01);
  });
});

describe('rankRoutes', () => {
  const targetSec = 27 * MIN;

  it('아무리 예쁜 길이라도 늦으면 지지 않는다 — fit이 지배한다', () => {
    const beautifulButLate = candidate('late', 33 * MIN, {
      scenic: 1,
      quiet: 1,
      novelty: 1,
      unbroken: 1,
      flat: 1,
      shade: 1,
    });
    const plainButOnTime = candidate('ontime', 27 * MIN, {
      scenic: 0.1,
      quiet: 0.1,
      novelty: 0.1,
      unbroken: 0.1,
      flat: 0.1,
      shade: 0.1,
    });

    const ranked = rankRoutes([beautifulButLate, plainButOnTime], {
      targetSec,
      weights: weightsFor('excited'),
    });

    expect(ranked[0].candidate.id).toBe('ontime');
  });

  it('시간이 비슷하면 기분에 맞는 길을 고른다', () => {
    const scenicRoute = candidate('scenic', 27 * MIN, { scenic: 1, novelty: 0.9 });
    const shadyRoute = candidate('shady', 27 * MIN + 20, { shade: 1, scenic: 0.1, novelty: 0.1 });

    const excited = rankRoutes([scenicRoute, shadyRoute], {
      targetSec,
      weights: weightsFor('excited'),
    });
    expect(excited[0].candidate.id).toBe('scenic');

    const hot = rankRoutes([scenicRoute, shadyRoute], {
      targetSec,
      weights: weightsFor('hot'),
    });
    expect(hot[0].candidate.id).toBe('shady');
  });

  it('추천 이유로 쓸 성질을 함께 돌려준다', () => {
    const shady = candidate('shady', 27 * MIN, { shade: 1 });
    const ranked = rankRoutes([shady], { targetSec, weights: weightsFor('hot') });

    expect(ranked[0].dominantFeature).toBe('shade');
  });

  it('최근에 걸은 길에는 감점을 준다', () => {
    const a = candidate('a', 27 * MIN);
    const b = candidate('b', 27 * MIN);

    const ranked = rankRoutes([a, b], {
      targetSec,
      weights: weightsFor('plain'),
      recentRouteIds: ['a'],
    });

    expect(ranked[0].candidate.id).toBe('b');
  });

  it('점수 내림차순으로 정렬된다', () => {
    const ranked = rankRoutes(
      [candidate('a', 33 * MIN), candidate('b', 27 * MIN), candidate('c', 29 * MIN)],
      { targetSec, weights: weightsFor('plain') }
    );

    expect(ranked.map((r) => r.candidate.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('nextRoute', () => {
  const target = 27 * MIN;

  it('"다른 길"을 누르면 아직 안 보여준 다음 후보를 준다', () => {
    const ranked = rankRoutes(
      [candidate('a', target), candidate('b', target - 30), candidate('c', target - 60)],
      { targetSec: target, weights: weightsFor('plain') }
    );

    const second = nextRoute(ranked, [ranked[0].candidate.id], target);
    expect(second?.candidate.id).toBe(ranked[1].candidate.id);
  });

  it('더 보여줄 게 없으면 null', () => {
    const ranked = rankRoutes([candidate('a', target)], {
      targetSec: target,
      weights: weightsFor('plain'),
    });

    expect(nextRoute(ranked, ['a'], target)).toBeNull();
  });

  /*
   * 여기가 이 파일의 핵심이다. 후보는 경유지를 흩뿌려 만들기 때문에 소요 시간이
   * 넓게 퍼지는데, 점수만 따라 내려가면 "다른 길"을 누를수록 안 맞는 길이 나온다.
   * 몇 번 누른 사람이 약속에 늦으면 이 앱은 존재 이유를 잃는다.
   */
  it('목표를 넘기는 길은 다른 길로도 내놓지 않는다', () => {
    const ranked = rankRoutes([candidate('a', target), candidate('late', 40 * MIN)], {
      targetSec: target,
      weights: weightsFor('plain'),
    });

    expect(ranked.map((r) => r.candidate.id)).toContain('late');
    expect(nextRoute(ranked, ['a'], target)).toBeNull();
  });

  /* 바닥(3분 전)을 넘기면 약속에 늦는다. 거기서부터는 봐주지 않는다. */
  it('바닥을 넘기는 길은 내놓지 않는다', () => {
    const over = target + (ARRIVE_EARLY_SEC - PROMISE_FLOOR_SEC) + 1;
    const ranked = rankRoutes([candidate('a', target), candidate('over', over)], {
      targetSec: target,
      weights: weightsFor('plain'),
    });

    expect(nextRoute(ranked, ['a'], target)).toBeNull();
  });

  it('목표 안에서 조금 이른 정도는 대안으로 받는다', () => {
    const ranked = rankRoutes([candidate('a', target), candidate('near', target - 45)], {
      targetSec: target,
      weights: weightsFor('plain'),
    });

    expect(nextRoute(ranked, ['a'], target)?.candidate.id).toBe('near');
  });
});

describe('firstRoute', () => {
  const target = 27 * MIN;

  it('아직 아무것도 안 보여준 상태의 nextRoute다', () => {
    const ranked = rankRoutes([candidate('early', 12 * MIN)], {
      targetSec: target,
      weights: weightsFor('plain'),
    });

    expect(firstRoute(ranked, target)?.candidate.id).toBe('early');
    expect(nextRoute(ranked, [], target)?.candidate.id).toBe('early');
  });

  /* 늦는 것만은 어느 쪽으로도 새지 않는다. */
  it('늦는 길은 처음 한 장으로도 내놓지 않는다', () => {
    const ranked = rankRoutes([candidate('late', 40 * MIN)], {
      targetSec: target,
      weights: weightsFor('plain'),
    });

    expect(firstRoute(ranked, target)).toBeNull();
  });

  it('제때 닿는 것 중 점수가 가장 높은 것을 준다', () => {
    const ranked = rankRoutes(
      [candidate('late', 40 * MIN), candidate('fit', target), candidate('early', 10 * MIN)],
      { targetSec: target, weights: weightsFor('plain') }
    );

    expect(firstRoute(ranked, target)?.candidate.id).toBe('fit');
  });
});

describe('arrivesOnTime', () => {
  const target = 27 * MIN;
  /** 목표(5분 전)와 바닥(3분 전)의 차이. 이만큼은 넘겨도 약속 전에 닿는다. */
  const SLACK = ARRIVE_EARLY_SEC - PROMISE_FLOOR_SEC;

  it('목표에 딱 맞으면 제때다', () => {
    expect(arrivesOnTime(target, target)).toBe(true);
  });

  /*
   * 폭이 0이었을 때 후보가 거의 전멸했다 — 경유지를 흩뿌려 만든 길들은 목표
   * 언저리로 흩어지는데 1초만 넘겨도 버리니 남는 게 없었고, 기분을 무엇으로
   * 골라도 늘 최단 경로 하나만 나왔다.
   */
  it('바닥까지는 받는다', () => {
    expect(arrivesOnTime(target + SLACK, target)).toBe(true);
  });

  it('바닥을 넘기면 안 받는다 — 그 너머는 약속에 늦는다', () => {
    expect(arrivesOnTime(target + SLACK + 1, target)).toBe(false);
  });

  it('짧은 건 얼마든 제때다', () => {
    expect(arrivesOnTime(1 * MIN, target)).toBe(true);
  });
});

/*
 * 일찍 닿는 길을 막지 않는다.
 *
 * 한때는 목표보다 5분 넘게 이른 길을 "다른 길"에서 뺐는데, 그 문턱이 하는 일은
 * 선택지를 줄이는 것뿐이었다 — 걷는 화면이 지금 속도로 몇 시에 닿을지 계속
 * 알려주므로 일찍 닿는다는 사실은 이미 사용자 앞에 있다.
 */
describe('일찍 닿는 길', () => {
  const target = 27 * MIN;

  it('아무리 일찍 닿아도 제때로 친다', () => {
    expect(arrivesOnTime(5 * MIN, target)).toBe(true);
  });

  it('"다른 길"로도 내놓는다', () => {
    const ranked = rankRoutes([candidate('a', target), candidate('early', 10 * MIN)], {
      targetSec: target,
      weights: weightsFor('plain'),
    });

    expect(nextRoute(ranked, ['a'], target)?.candidate.id).toBe('early');
  });
});

describe('weightsFor', () => {
  it('가중치 합은 항상 1', () => {
    for (const mood of ['pensive', 'excited', 'nervous', 'tired', 'hot', 'plain'] as const) {
      const w = weightsFor(mood);
      const sum = Object.values(w).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 6);
    }
  });

  it('한여름 한낮이면 어떤 기분이든 그늘 가중치가 올라간다', () => {
    const normal = weightsFor('pensive', false);
    const summer = weightsFor('pensive', true);

    expect(summer.shade).toBeGreaterThan(normal.shade);
  });

  it('"햇볕이 싫어요"는 이미 그늘이 최우선이라 더 얹지 않는다', () => {
    expect(weightsFor('hot', true)).toEqual(weightsFor('hot', false));
  });
});

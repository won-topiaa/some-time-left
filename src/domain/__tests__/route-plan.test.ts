import { describe, expect, it } from 'vitest';
import { weightsFor } from '../mood';
import { durationFit, keepsPromise, nextRoute, rankRoutes } from '../route-plan';
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
  it('"다른 길"을 누르면 아직 안 보여준 다음 후보를 준다', () => {
    const ranked = rankRoutes(
      [candidate('a', 27 * MIN), candidate('b', 27 * MIN + 30), candidate('c', 28 * MIN)],
      { targetSec: 27 * MIN, weights: weightsFor('plain') }
    );

    const second = nextRoute(ranked, [ranked[0].candidate.id], 27 * MIN);
    expect(second?.candidate.id).toBe(ranked[1].candidate.id);
  });

  it('더 보여줄 게 없으면 null', () => {
    const ranked = rankRoutes([candidate('a', 27 * MIN)], {
      targetSec: 27 * MIN,
      weights: weightsFor('plain'),
    });

    expect(nextRoute(ranked, ['a'], 27 * MIN)).toBeNull();
  });

  /*
   * 여기가 이 파일의 핵심이다. 후보는 경유지를 흩뿌려 만들기 때문에 소요 시간이
   * 넓게 퍼지는데, 점수만 따라 내려가면 "다른 길"을 누를수록 안 맞는 길이 나온다.
   * 몇 번 누른 사람이 약속에 늦으면 이 앱은 존재 이유를 잃는다.
   */
  it('약속에 늦는 길은 다른 길로도 내놓지 않는다', () => {
    const ranked = rankRoutes([candidate('a', 27 * MIN), candidate('late', 40 * MIN)], {
      targetSec: 27 * MIN,
      weights: weightsFor('plain'),
    });

    expect(ranked.map((r) => r.candidate.id)).toContain('late');
    expect(nextRoute(ranked, ['a'], 27 * MIN)).toBeNull();
  });

  it('너무 일찍 닿는 길도 내놓지 않는다', () => {
    const ranked = rankRoutes([candidate('a', 27 * MIN), candidate('early', 15 * MIN)], {
      targetSec: 27 * MIN,
      weights: weightsFor('plain'),
    });

    expect(nextRoute(ranked, ['a'], 27 * MIN)).toBeNull();
  });

  it('조금 어긋나는 정도는 대안으로 받는다', () => {
    const ranked = rankRoutes([candidate('a', 27 * MIN), candidate('near', 27 * MIN + 45)], {
      targetSec: 27 * MIN,
      weights: weightsFor('plain'),
    });

    expect(nextRoute(ranked, ['a'], 27 * MIN)?.candidate.id).toBe('near');
  });
});

describe('keepsPromise', () => {
  const target = 27 * MIN;

  it('목표에 맞으면 지킨다', () => {
    expect(keepsPromise(target, target)).toBe(true);
  });

  it('1분까지 늦는 건 받고, 그 너머는 안 받는다', () => {
    expect(keepsPromise(target + 60, target)).toBe(true);
    expect(keepsPromise(target + 61, target)).toBe(false);
  });

  it('5분까지 이른 건 받고, 그 너머는 안 받는다', () => {
    expect(keepsPromise(target - 5 * MIN, target)).toBe(true);
    expect(keepsPromise(target - 5 * MIN - 1, target)).toBe(false);
  });

  /* 늦는 쪽이 이른 쪽보다 훨씬 좁아야 한다. 늦으면 약속이 깨지고, 이르면 아깝기만 하다. */
  it('늦는 쪽에 더 가혹하다', () => {
    expect(keepsPromise(target + 3 * MIN, target)).toBe(false);
    expect(keepsPromise(target - 3 * MIN, target)).toBe(true);
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

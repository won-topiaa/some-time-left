import { describe, expect, it } from 'vitest';
import { MOODS, scoreFeatures, weightsFor } from '../mood';
import {
  MOOD_SHARE,
  arrivesOnTime,
  durationFit,
  firstRoute,
  nextRoute,
  rankRoutes,
} from '../route-plan';
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

  /*
   * 예전엔 `durationFit(32분, 27분) < 0.01`로 못 박아 뒀다. 그 수는 늦는 쪽 폭이
   * 60초였을 때의 값이고, 그 좁음이 바로 문제였다 — 약속을 지키는 두 후보
   * (목표 30분에 29.3분과 31.1분) 사이에서도 fit이 3.2배 벌어져 기분이 이길 수가
   * 없었다. 폭을 넓히면서 그 수는 못이 아니라 흔적이 됐으므로, **지켜야 할
   * 성질** 두 개로 바꿔 적는다.
   */
  it('약속을 벗어난 길은 기분으로도 못 살린다', () => {
    const target = 27 * MIN;
    const tooLate = target + 300;
    // 관문 밖이라는 것부터 확인한다. 안쪽이면 이 성질을 요구할 이유가 없다.
    expect(arrivesOnTime(tooLate, target)).toBe(false);

    const strongestRescue = 1 / (1 - MOOD_SHARE);
    expect(durationFit(tooLate, target) * strongestRescue).toBeLessThan(
      durationFit(target, target)
    );
  });

  it('약속을 지키는 구간 안에서는 기분이 결정할 수 있다', () => {
    const target = 27 * MIN;
    const strongestRescue = 1 / (1 - MOOD_SHARE);

    // 늦는 쪽 관문 끝(+2분)과 이른 쪽 관문 끝(-5분).
    for (const durationSec of [target + 120, target - 300]) {
      expect(arrivesOnTime(durationSec, target)).toBe(true);
      expect(durationFit(target, target) / durationFit(durationSec, target)).toBeLessThan(
        strongestRescue
      );
    }
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

/**
 * 고른 기분이 결과를 바꾸는가.
 *
 * 이 앱은 첫 화면 추신에서 "오늘 기분에 맞춰서요"라고 약속한다. 그런데 실기기에서
 * 기분을 바꿔도 늘 같은 길이 나왔다. 원인이 둘이었는데 둘 다 기분과 무관한
 * 곳에 있었다 — 후보가 목표를 넘겨 관문에 한 장만 남았고(waypoints.ts), 남은
 * 것들 사이에서도 fit이 기분을 압도했다(위의 폭).
 *
 * 여기서는 두 번째만 본다. 약속을 지키는 후보가 여럿 있을 때 기분이 실제로
 * 결정권을 갖는지.
 */
describe('rankRoutes — 기분이 결정한다', () => {
  const targetSec = 27 * MIN;

  /*
   * 약속을 지키는 세 후보. 성질 차이를 **실제로 재지는 만큼만** 벌려 둔다.
   *
   * 0.9 대 0.2처럼 벌려 놓으면 절대값만으로도 기분이 이겨서, 정규화를 없애도
   * 테스트가 통과한다 — 실기기에서 안 되던 것을 못 잡는 못이 된다. 실측한 성질
   * 차이는 0.1~0.15 수준이고, 가중치 합이 1이라 그 차이가 다시 눌린다.
   */
  const promiseKeepers = [
    candidate('quiet', targetSec + 90, { quiet: 0.62, scenic: 0.48, flat: 0.48, unbroken: 0.48 }),
    candidate('scenic', targetSec - 90, { quiet: 0.48, scenic: 0.62, flat: 0.48, unbroken: 0.48 }),
    candidate('flat', targetSec + 30, { quiet: 0.48, scenic: 0.48, flat: 0.62, unbroken: 0.62 }),
  ];

  it('셋 다 약속을 지킨다 — 여기서는 시간이 가릴 일이 아니다', () => {
    for (const c of promiseKeepers) {
      expect(arrivesOnTime(c.durationSec, targetSec)).toBe(true);
    }
  });

  it('기분을 바꾸면 뽑히는 길이 바뀐다', () => {
    const picked = new Set(
      MOODS.map(
        (mood) =>
          rankRoutes(promiseKeepers, { targetSec, weights: weightsFor(mood.id) })[0].candidate.id
      )
    );

    // 여섯 기분이 한 길만 고른다면 기분을 물어본 의미가 없다.
    expect(picked.size).toBeGreaterThan(1);
  });

  it('절대값만으로는 기분이 이길 수 없다 — 이 후보들이 그 증거다', () => {
    /*
     * fit 차이가 기분의 **절대** 차이보다 크다. 그래서 정규화 없이는 시간이 전부
     * 결정한다. 이 관계가 깨지면 위 테스트가 정규화를 안 해도 통과하게 된다.
     */
    const weights = weightsFor('pensive');
    const scores = promiseKeepers.map((c) => scoreFeatures(c.features, weights));
    const absoluteRatio =
      (1 - MOOD_SHARE + MOOD_SHARE * Math.max(...scores)) /
      (1 - MOOD_SHARE + MOOD_SHARE * Math.min(...scores));
    const fits = promiseKeepers.map((c) => durationFit(c.durationSec, targetSec));
    const fitRatio = Math.max(...fits) / Math.min(...fits);

    expect(absoluteRatio).toBeLessThan(fitRatio);
  });

  /*
   * 상대값으로 세우는 데서 오는 위험. 성질을 하나도 못 잰 날(키가 없거나 환경
   * API가 전부 실패한 날) 후보들의 기분 점수는 완전히 같다. 그때 억지로 순위를
   * 매기면 부동소수 끝자리를 "기분에 맞는 길"로 부풀려 내놓게 된다.
   */
  it('성질을 못 재면 기분은 말을 얹지 않는다', () => {
    const sameEverywhere = [
      candidate('near', targetSec + 30),
      candidate('far', targetSec + 110),
    ];

    for (const mood of MOODS) {
      const ranked = rankRoutes(sameEverywhere, { targetSec, weights: weightsFor(mood.id) });
      // 시간이 정한다 — 목표에 가까운 쪽.
      expect(ranked[0].candidate.id).toBe('near');
      // 기분 배수는 모두 가운데(0.5)로 놓인다 — 아무도 유리하지 않다.
      expect(ranked[0].score).toBeCloseTo(
        ranked[0].fit * (1 - MOOD_SHARE + MOOD_SHARE * 0.5),
        6
      );
    }
  });

  /*
   * 자를 후보 전부로 만들면, 어차피 관문에서 걸러질 길이 양끝을 차지하면서
   * 정작 화면에 나갈 수 있는 것들이 가운데로 눌린다. 실측: 약속을 지키는 후보가
   * 7개인 날에도 기분 여섯이 두 갈래만 골랐다.
   */
  it('고를 수 없는 후보는 자를 왜곡하지 않는다', () => {
    const tooLate = candidate('too-late', targetSec + 600, {
      quiet: 1,
      flat: 1,
      shade: 1,
      scenic: 1,
      novelty: 1,
      unbroken: 1,
    });
    expect(arrivesOnTime(tooLate.durationSec, targetSec)).toBe(false);

    const order = (cands: RouteCandidate[]) =>
      rankRoutes(cands, { targetSec, weights: weightsFor('pensive') })
        .filter((r) => arrivesOnTime(r.candidate.durationSec, targetSec))
        .map((r) => r.candidate.id);

    expect(order([...promiseKeepers, tooLate])).toEqual(order(promiseKeepers));

    /*
     * 순서만 보면 못이 안 된다 — 정규화는 단조 변환이라 순서를 바꾸지 않는다.
     * 정작 잃는 것은 **폭**이다. 고를 수 없는 길이 자의 양끝을 차지하면 남은
     * 것들이 가운데로 눌려 기분이 낼 수 있는 차이가 줄어든다. 그래서 폭을 본다.
     */
    const factors = rankRoutes([...promiseKeepers, tooLate], {
      targetSec,
      weights: weightsFor('pensive'),
    })
      .filter((r) => arrivesOnTime(r.candidate.durationSec, targetSec))
      .map((r) => r.score / r.fit);

    expect(Math.max(...factors)).toBeCloseTo(1, 6);
    expect(Math.min(...factors)).toBeCloseTo(1 - MOOD_SHARE, 6);
  });

  it('잰 값은 그대로 남긴다 — 상대값은 순위에만 쓴다', () => {
    // 화면과 기록이 보는 moodScore가 후보 집합에 따라 흔들리면 안 된다.
    const alone = rankRoutes([promiseKeepers[0]], {
      targetSec,
      weights: weightsFor('pensive'),
    })[0];
    const together = rankRoutes(promiseKeepers, {
      targetSec,
      weights: weightsFor('pensive'),
    }).find((r) => r.candidate.id === 'quiet');

    expect(together?.moodScore).toBeCloseTo(alone.moodScore, 10);
  });
});

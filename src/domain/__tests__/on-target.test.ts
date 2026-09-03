import { describe, expect, it } from 'vitest';
import {
  ON_TARGET_EARLY_SEC,
  arrivesOnTime,
  firstRoute,
  isFallbackRoute,
  landsOnTarget,
  nextRoute,
  rankRoutes,
} from '../route-plan';
import { weightsFor } from '../mood';
import { PROMISE_FLOOR_SEC, ARRIVE_EARLY_SEC } from '../time';
import type { RouteCandidate, RouteFeatures } from '../types';

const MIN = 60;
const LATE_SLACK_SEC = ARRIVE_EARLY_SEC - PROMISE_FLOOR_SEC;

const neutral = (patch: Partial<RouteFeatures> = {}): RouteFeatures => ({
  quiet: 0.5,
  flat: 0.5,
  shade: 0.5,
  scenic: 0.5,
  novelty: 0.5,
  unbroken: 0.5,
  ...patch,
});

const candidate = (id: string, durationSec: number, features?: Partial<RouteFeatures>): RouteCandidate => ({
  id,
  durationSec,
  distanceM: durationSec * 1.25,
  features: neutral(features),
  path: [],
  segments: [],
});

/**
 * "내놓아도 되는가"(arrivesOnTime)와 "맞췄다고 말해도 되는가"(landsOnTarget)는 다르다.
 *
 * 둘이 하나였을 때 후보가 전부 늦어 최단으로 물러선 날에도 화면이 "5분 전에 닿는
 * 길이에요"라고 말했다 — 최단은 늦지 않으니까. 15분짜리 길에 그 말을 붙이고
 * 바로 아래 도착 시각을 적으면 같은 화면이 스스로를 반박한다.
 */
describe('landsOnTarget', () => {
  const target = 30 * MIN;

  it('목표에 딱 맞으면 맞춘 것', () => {
    expect(landsOnTarget(target, target)).toBe(true);
  });

  it('바닥(3분 전)까지 늦는 건 맞춘 것 — arrivesOnTime과 같은 위쪽 경계', () => {
    expect(landsOnTarget(target + LATE_SLACK_SEC, target)).toBe(true);
    expect(landsOnTarget(target + LATE_SLACK_SEC + 1, target)).toBe(false);
  });

  it('이른 쪽 폭 안이면 맞춘 것, 넘으면 아니다', () => {
    expect(landsOnTarget(target - ON_TARGET_EARLY_SEC, target)).toBe(true);
    expect(landsOnTarget(target - ON_TARGET_EARLY_SEC - 1, target)).toBe(false);
  });

  it('arrivesOnTime은 아무리 일러도 참이지만 landsOnTarget은 아니다', () => {
    expect(arrivesOnTime(10 * MIN, target)).toBe(true);
    expect(landsOnTarget(10 * MIN, target)).toBe(false);
  });
});

describe('후보가 전부 늦어 최단으로 물러선 날', () => {
  const target = 30 * MIN;
  const options = { targetSec: target, weights: weightsFor('plain') };
  const ranked = rankRoutes(
    [candidate('a', 33 * MIN), candidate('b', 35 * MIN), candidate('c', 40 * MIN)],
    options
  );
  const floor = rankRoutes([candidate('shortest', 15 * MIN, { novelty: 1 })], options)[0];

  it('순위에서는 아무것도 안 나오고 최단이 받는다', () => {
    expect(nextRoute(ranked, [], target)).toBeNull();
    expect(firstRoute(ranked, target)).toBeNull();
    const current = nextRoute(ranked, [], target) ?? firstRoute(ranked, target) ?? floor;
    expect(current.candidate.id).toBe('shortest');
  });

  it('그 최단은 내놓아도 되지만(제때) 맞췄다고는 못 한다', () => {
    expect(arrivesOnTime(floor.candidate.durationSec, target)).toBe(true);
    expect(landsOnTarget(floor.candidate.durationSec, target)).toBe(false);
  });

  it('최단의 novelty는 재본 값이 아니라 1.0이라 이유로 쓰면 안 된다', () => {
    // route 화면은 fallback일 때 이 값을 문장으로 만들지 않는다.
    expect(floor.dominantFeature).toBe('novelty');
  });
});

describe('후보가 하나도 안 나온 날 — 물러섰다는 것을 화면이 알아야 한다', () => {
  /*
   * 위 describe와 다른 경우다. 저기는 후보가 **있었는데 전부 늦은** 날이고,
   * 여기는 경유지가 하나도 도로망에 안 붙어 후보가 **아예 없는** 날이다.
   * 그때 `useRouteSuggestion`은 `usable = [shortest]`로 물러선다.
   *
   * 이 구분이 중요한 이유: 화면이 "물러섰다"는 것을 아는 수단이 `fallback`인데,
   * 그게 `current === floor`(껍데기 비교)였다. 두 값은 `rankRoutes`를 각각 부른
   * 결과라 같은 길을 감싸고도 **다른 객체**다. 그래서 이 날 깃발이 안 켜졌고,
   * 화면은 "돌아갈 길을 못 찾았어요"라고 말하면서 그 아래에 최단의 재보지 않은
   * novelty(늘 1.0)로 "아직 안 가보신 길이에요"를 붙였다.
   */
  const target = 30 * MIN;
  const shortest = candidate('shortest', 20 * MIN);
  const options = { targetSec: target, weights: weightsFor('plain') };

  // useRouteSuggestion이 하는 그대로 — 두 번 따로 순위를 매긴다.
  const ranked = rankRoutes([shortest], options);
  const floor = rankRoutes([shortest], options)[0];
  const current = nextRoute(ranked, [], target) ?? firstRoute(ranked, target) ?? floor;

  it('물러선 것을 알아본다', () => {
    /*
     * 이 한 줄이 이 describe의 전부다. `===`로 껍데기를 비교하는 구현으로
     * 되돌리면 여기서 깨진다 — 두 `ScoredRoute`는 서로 다른 객체이기 때문이다.
     */
    expect(isFallbackRoute(current, floor)).toBe(true);
  });

  it('껍데기는 서로 다르다 — 그래서 `===`로는 못 알아본다', () => {
    expect(current).not.toBe(floor);
  });

  it('늘린 후보가 나온 날은 물러선 게 아니다', () => {
    const stretched = candidate('stretched', 29 * MIN);
    const rankedBoth = rankRoutes([stretched, shortest], options);
    const picked = nextRoute(rankedBoth, [], target);

    expect(picked?.candidate.id).toBe('stretched');
    expect(isFallbackRoute(picked, floor)).toBe(false);
  });

  it('둘 중 하나라도 없으면 물러섰다고 하지 않는다', () => {
    expect(isFallbackRoute(null, floor)).toBe(false);
    expect(isFallbackRoute(current, null)).toBe(false);
  });
});

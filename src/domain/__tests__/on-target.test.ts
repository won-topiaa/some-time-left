import { describe, expect, it } from 'vitest';
import {
  ON_TARGET_EARLY_SEC,
  arrivesOnTime,
  firstRoute,
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

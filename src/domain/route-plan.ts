/**
 * 후보 경로들 중에서 "3분 전 도착"에 맞고 기분에도 맞는 하나를 고른다.
 *
 * 두 축을 곱한다.
 * - fit:   목표 소요 시간에 얼마나 정확히 맞는가
 * - mood:  고른 기분에 얼마나 맞는가
 *
 * fit이 지배적이어야 한다. 아무리 예쁜 길이라도 늦으면 이 앱은 실패한 것이다.
 */

import { dominantFeature, scoreFeatures, type FeatureWeights } from './mood';
import type { RouteCandidate, ScoredRoute } from './types';

/** 늦는 쪽 오차의 허용 폭 (초). 좁을수록 지각에 가혹해진다. */
const LATE_SIGMA_SEC = 60;
/** 일찍 도착하는 쪽 오차의 허용 폭 (초). 3분보다 더 일찍 도착하는 건 덜 나쁘다. */
const EARLY_SIGMA_SEC = 180;

/** 기분 점수가 최종 점수에 기여하는 최대 비율. 나머지는 fit이 가져간다. */
const MOOD_SHARE = 0.5;

/**
 * 목표 시간 대비 소요 시간의 적합도 (0~1).
 * 늦는 쪽과 이른 쪽에 다른 벌점을 주는 비대칭 가우시안.
 */
export function durationFit(durationSec: number, targetSec: number): number {
  const error = durationSec - targetSec;
  const sigma = error > 0 ? LATE_SIGMA_SEC : EARLY_SIGMA_SEC;
  return Math.exp(-((error / sigma) ** 2));
}

export interface RankOptions {
  targetSec: number;
  weights: FeatureWeights;
  /** 최근에 걸었던 경로 id — 같은 길을 계속 추천하지 않기 위해 */
  recentRouteIds?: string[];
}

/** 최근에 걸은 길에 주는 감점. */
const REPEAT_PENALTY = 0.85;

export function rankRoutes(
  candidates: RouteCandidate[],
  { targetSec, weights, recentRouteIds = [] }: RankOptions
): ScoredRoute[] {
  const recent = new Set(recentRouteIds);

  return candidates
    .map<ScoredRoute>((candidate) => {
      const fit = durationFit(candidate.durationSec, targetSec);
      const moodScore = scoreFeatures(candidate.features, weights);
      const repeat = recent.has(candidate.id) ? REPEAT_PENALTY : 1;
      const score = fit * (1 - MOOD_SHARE + MOOD_SHARE * moodScore) * repeat;

      return {
        candidate,
        fit,
        moodScore,
        score,
        dominantFeature: dominantFeature(candidate.features, weights),
      };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * 사용자가 "다른 길"을 눌렀을 때 다음 후보.
 * 이미 보여준 것들을 빼고 그다음으로 좋은 것.
 */
export function nextRoute(
  ranked: ScoredRoute[],
  shownRouteIds: string[]
): ScoredRoute | null {
  const shown = new Set(shownRouteIds);
  return ranked.find((r) => !shown.has(r.candidate.id)) ?? null;
}

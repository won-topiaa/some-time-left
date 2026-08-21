/**
 * 후보 경로들 중에서 "약속보다 먼저 도착"에 맞고 기분에도 맞는 하나를 고른다.
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
/** 일찍 도착하는 쪽 오차의 허용 폭 (초). 목표보다 더 일찍 도착하는 건 덜 나쁘다. */
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

/**
 * 목표보다 오래 걸리는 길은 **내놓지 않는다.** 한 뼘도 봐주지 않는다.
 *
 * 목표(`targetWalkSec`)는 이미 약속보다 `ARRIVE_EARLY_SEC`(5분) 앞에 닿도록
 * 잡아 둔 값이다. 여기서 조금씩 넘겨 주기 시작하면 그 5분이 바로 그 자리에서
 * 녹는다 — 실제로 걷는 사람에게는 신호 대기와 도로망 오차가 그 위에 또 얹힌다.
 * 여유를 주는 자리는 여기가 아니라 5분이라는 숫자 자체다.
 */
export function arrivesOnTime(durationSec: number, targetSec: number): boolean {
  return durationSec <= targetSec;
}

/**
 * 대안으로 내놓아도 되는 이름의 한계 (초).
 *
 * 늦는 것보다 덜 나쁘지만 공짜는 아니다. 10분 전에 닿는 길은 약속이 다른 앱의 것이고,
 * 무엇보다 사용자가 이 앱을 켠 이유(자투리 시간을 걷기로 쓰는 것)를 그만큼 돌려주지 않는다.
 */
export const EARLY_TOLERANCE_SEC = 5 * 60;

/**
 * 이 길이 "다른 길"로 내놓을 만한가.
 *
 * 제때 닿는 것에 더해, 너무 일찍 닿지도 않아야 한다.
 *
 * 점수(`score`)와 별개로 둔다. 점수는 후보들 사이의 **순서**를 정할 뿐이라
 * 전부 나쁘면 그중 제일 나은 것이 1등이 된다. 약속을 지키는지는 순위가 아니라
 * 문턱이어야 한다 — 그래서 비교가 아니라 이 함수가 판단한다.
 */
export function keepsPromise(durationSec: number, targetSec: number): boolean {
  return arrivesOnTime(durationSec, targetSec) && targetSec - durationSec <= EARLY_TOLERANCE_SEC;
}

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
 * 이미 보여준 것들을 빼고, **약속을 지키는 것 중에서** 그다음으로 좋은 것.
 *
 * 문턱을 두는 이유: 후보는 경유지를 흩뿌려 만들기 때문에 소요 시간이 넓게 퍼진다.
 * 문턱 없이 순위만 따라 내려가면 "다른 길"을 누를수록 점점 안 맞는 길이 나오고,
 * 몇 번 누른 사람은 약속에 늦는다. 이 앱이 하나 지키기로 한 것이 그것뿐인데
 * 버튼 하나로 무너지면 안 된다.
 *
 * 그래서 보여줄 게 없으면 없는 것으로 둔다 — 화면은 "다른 길" 버튼을 감춘다.
 * 나쁜 선택지를 주는 것보다 선택지가 없는 편이 정직하다.
 */
/**
 * 처음 보여줄 한 장.
 *
 * `nextRoute`보다 문턱이 하나 낮다 — 너무 일찍 닿는 것은 봐주고, **늦는 것만 막는다.**
 * 여유가 두 시간 남은 날에는 어느 후보도 목표에 못 미치는데, 그때 빈 화면을 주면
 * 걷지도 못하고 왜 안 되는지도 모른다. 일찍 닿는 건 아쉬운 일이지 실패가 아니다.
 *
 * 늦는 길이 여기로 새지 않는 건 후보 목록에 **최단 경로가 항상 들어 있기** 때문이다
 * (`useRouteSuggestion`). 늘리는 계획이 섰다는 건 최단이 목표 안에 든다는 뜻이므로,
 * 최악의 경우에도 이 함수는 최단 경로를 돌려준다.
 */
export function firstRoute(ranked: ScoredRoute[], targetSec: number): ScoredRoute | null {
  return ranked.find((r) => arrivesOnTime(r.candidate.durationSec, targetSec)) ?? null;
}

export function nextRoute(
  ranked: ScoredRoute[],
  shownRouteIds: string[],
  targetSec: number
): ScoredRoute | null {
  const shown = new Set(shownRouteIds);
  return (
    ranked.find(
      (r) => !shown.has(r.candidate.id) && keepsPromise(r.candidate.durationSec, targetSec)
    ) ?? null
  );
}

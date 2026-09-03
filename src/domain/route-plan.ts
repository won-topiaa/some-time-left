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
import { ARRIVE_EARLY_SEC, PROMISE_FLOOR_SEC } from './time';
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
 * 목표를 넘겨도 받아 주는 폭 (초). 목표(맑은 날 `ARRIVE_EARLY_SEC` 5분)와 바닥
 * (`PROMISE_FLOOR_SEC` 3분)의 **차이** 2분이다. 차이만 쓰므로 목표가 물러나면 바닥도
 * 같이 물러난다 — 비 오는 날은 7분을 겨누고 5분 전까지 받는다. 상수로 바꾸지 말 것.
 *
 * 이 폭이 0이었을 때 후보가 거의 전멸했다 — 경유지를 흩뿌려 만든 길들은 목표
 * 언저리로 흩어지는데, 1초만 넘겨도 버리니 남는 게 없었다. 기분을 무엇으로 골라도
 * 늘 같은 길(최단 경로)만 나왔다.
 */
const LATE_SLACK_SEC = ARRIVE_EARLY_SEC - PROMISE_FLOOR_SEC;

/**
 * 이 길로 가도 **약속 전에 닿는가.**
 *
 * 목표(`targetWalkSec`)는 약속보다 그날의 `earlySec`(맑은 날 5분, 내리는 날 7분) 앞에
 * 닿도록 잡은 값이고, 여기서 최대 `LATE_SLACK_SEC`까지는 받는다 — 그래도 목표보다
 * 2분 안쪽(맑은 날 3분 전, 내리는 날 5분 전)에는 닿는다. 그 너머는 안 받는다.
 * 이 함수가 이 앱의 유일한 약속이다.
 */
export function arrivesOnTime(durationSec: number, targetSec: number): boolean {
  return durationSec <= targetSec + LATE_SLACK_SEC;
}

/**
 * 이 길을 "약속 앞 목표에 맞춘 길"이라고 **말해도 되는** 이른 쪽 폭 (초).
 *
 * 고르는 문턱이 아니라 말하는 문턱이다. 일찍 닿는 길도 내놓기로 했지만(`nextRoute`),
 * 그 길에 "N분 전에 닿는 길이에요"를 붙이면 바로 아래 적힌 도착 시각이 그 말을
 * 즉시 들킨다 — 약속 45분 전에 닿는 길을 두고 그렇게 말할 수는 없다.
 */
export const ON_TARGET_EARLY_SEC = 5 * 60;

/**
 * 이 길이 목표 언저리에 닿는가 — 늦지 않으면서 `ON_TARGET_EARLY_SEC`보다 이르지도 않은가.
 *
 * `arrivesOnTime`이 "내놓아도 되는가"라면 이건 "맞췄다고 말해도 되는가"다.
 * 둘을 한 함수로 합쳤을 때 후보가 전부 늦어 최단으로 물러선 날에도 화면이
 * "N분 전에 닿는 길이에요"라고 말했다 — 최단은 늦지 않으니까. 물러선 날은
 * 물러섰다고 말해야 한다.
 */
export function landsOnTarget(durationSec: number, targetSec: number): boolean {
  return arrivesOnTime(durationSec, targetSec) && targetSec - durationSec <= ON_TARGET_EARLY_SEC;
}

/**
 * 지금 보여주는 길이 **최단으로 물러선 그 길**인가.
 *
 * 화면은 이 값이 참이면 추천 이유를 붙이지 않는다. 최단은 첫 화면을 빠르게
 * 띄우려고 환경 데이터 없이 만들어서 성질이 재본 값이 아니기 때문이다
 * (novelty가 늘 1.0이라, 매일 걷는 출근길에 "아직 안 가보신 길이에요"가 된다).
 *
 * **껍데기가 아니라 감싼 길을 비교한다.** 부르는 쪽은 `rankRoutes`를 두 번 따로
 * 부르므로, 같은 길이라도 `ScoredRoute` 객체는 서로 다르다. 예전에 `===`로
 * 껍데기를 비교했다가 후보가 하나도 안 나온 날 — 이 깃발이 가장 필요한 날 —
 * 에 거짓이 됐고, 화면이 "돌아갈 길을 못 찾았어요"와 "아직 안 가보신 길이에요"를
 * 나란히 말했다. `candidate`는 두 호출이 같은 객체를 그대로 물고 있다.
 */
export function isFallbackRoute(
  current: ScoredRoute | null,
  floor: ScoredRoute | null
): boolean {
  return current != null && floor != null && current.candidate === floor.candidate;
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
 * 처음 보여줄 한 장. 아직 아무것도 안 보여준 상태의 `nextRoute`다.
 *
 * 후보가 전부 늦어서 null이 나오는 날을 위해 `useRouteSuggestion`이 최단 경로를
 * 따로 들고 있다 — 늘리는 계획이 섰다는 건 최단이 목표 안에 든다는 뜻이므로,
 * 그 한 장은 언제나 제때 닿는다.
 */
export function firstRoute(ranked: ScoredRoute[], targetSec: number): ScoredRoute | null {
  // 아직 아무것도 안 보여준 상태의 nextRoute다. 같은 규칙을 두 군데 적지 않는다 —
  // 한쪽만 고치면 첫 길과 다음 길의 기준이 소리 없이 갈라진다.
  return nextRoute(ranked, [], targetSec);
}

/**
 * 사용자가 "다른 길"을 눌렀을 때 다음 후보.
 * 이미 보여준 것들을 빼고, **제때 닿는 것 중에서** 그다음으로 좋은 것.
 *
 * 문턱을 두는 이유: 후보는 경유지를 흩뿌려 만들기 때문에 소요 시간이 넓게 퍼진다.
 * 문턱 없이 순위만 따라 내려가면 "다른 길"을 누를수록 점점 늦는 길이 나오고,
 * 몇 번 누른 사람은 약속에 늦는다. 이 앱이 하나 지키기로 한 것이 그것뿐인데
 * 버튼 하나로 무너지면 안 된다.
 *
 * 일찍 닿는 쪽은 막지 않는다. 걷는 화면이 지금 속도로 몇 시에 닿을지 계속
 * 알려주므로, 일찍 닿는다는 사실은 이미 사용자 앞에 있다.
 */
export function nextRoute(
  ranked: ScoredRoute[],
  shownRouteIds: string[],
  targetSec: number
): ScoredRoute | null {
  const shown = new Set(shownRouteIds);
  return (
    ranked.find(
      (r) => !shown.has(r.candidate.id) && arrivesOnTime(r.candidate.durationSec, targetSec)
    ) ?? null
  );
}

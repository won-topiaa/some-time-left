/**
 * 기분 → 경로 가중치.
 *
 * 사용자는 경사·혼잡도를 고르지 않는다. 기분만 고른다.
 * 이 표가 그 번역기이고, 사용자에게는 끝까지 보이지 않는다.
 */

import type { FeatureKey, MoodId, RouteFeatures } from './types';
import { FEATURE_KEYS } from './types';

export interface Mood {
  id: MoodId;
  /** 선택 카드에 적히는 문구. 이 문장이 곧 제품의 톤이다. */
  label: string;
  /** 고르고 난 뒤 짧게 받아주는 말 */
  ack: string;
}

export const MOODS: Mood[] = [
  { id: 'pensive', label: '생각이 많아요', ack: '조용히 걸을 수 있게 할게요.' },
  { id: 'excited', label: '설레요', ack: '기분 좋은 길로 갈게요.' },
  { id: 'nervous', label: '긴장돼요', ack: '숨 고를 수 있는 길로 갈게요.' },
  { id: 'tired', label: '지쳤어요', ack: '힘 덜 드는 길로 갈게요.' },
  { id: 'hot', label: '햇볕이 싫어요', ack: '그늘을 최대한 찾아볼게요.' },
  { id: 'plain', label: '그냥 그래요', ack: '안 가본 길로 데려가 볼게요.' },
];

export type FeatureWeights = Record<FeatureKey, number>;

const ZERO: FeatureWeights = {
  quiet: 0,
  flat: 0,
  shade: 0,
  scenic: 0,
  novelty: 0,
  unbroken: 0,
};

const BASE_WEIGHTS: Record<MoodId, Partial<FeatureWeights>> = {
  // 생각이 끊기지 않는 게 제일 중요하다. 신호등이 적고 한적한 길.
  pensive: { unbroken: 0.35, quiet: 0.3, flat: 0.15, scenic: 0.1, shade: 0.1 },
  // 볼 게 있어야 한다. 처음 가는 길도 반갑다.
  excited: { scenic: 0.4, novelty: 0.25, quiet: 0.1, unbroken: 0.15, shade: 0.1 },
  // 숨이 차면 안 된다. 평탄하고 조용하게.
  nervous: { flat: 0.3, quiet: 0.3, unbroken: 0.25, shade: 0.15 },
  // 오르막이 제일 큰 적. 그늘도 체력이다.
  tired: { flat: 0.45, shade: 0.25, quiet: 0.15, unbroken: 0.15 },
  // 그늘이 전부.
  hot: { shade: 0.6, quiet: 0.15, flat: 0.15, unbroken: 0.1 },
  // 특별한 요구가 없을 때가 새 길을 권하기 제일 좋은 때다.
  plain: { novelty: 0.4, scenic: 0.25, quiet: 0.2, unbroken: 0.15 },
};

/** 한여름 한낮에 그늘 가중치를 얹는 정도. */
const SUMMER_SHADE_BOOST = 0.25;

function normalize(weights: FeatureWeights): FeatureWeights {
  const sum = FEATURE_KEYS.reduce((acc, k) => acc + weights[k], 0);
  if (sum <= 0) {
    return { ...ZERO };
  }
  const out = { ...ZERO };
  for (const k of FEATURE_KEYS) {
    out[k] = weights[k] / sum;
  }
  return out;
}

/**
 * 기분에 해당하는 가중치를 만든다.
 * `shadeWorthy`가 참이면(한여름 한낮) 어떤 기분을 골랐든 그늘을 얹는다 —
 * 사용자가 "더워요"라고 말하지 않아도 더운 건 사실이니까.
 */
export function weightsFor(mood: MoodId, shadeWorthy = false): FeatureWeights {
  const base: FeatureWeights = { ...ZERO, ...BASE_WEIGHTS[mood] };

  if (!shadeWorthy || mood === 'hot') {
    return normalize(base);
  }

  return normalize({ ...base, shade: base.shade + SUMMER_SHADE_BOOST });
}

/** 가중치와 경로 성질을 곱해 0~1 점수로. */
export function scoreFeatures(features: RouteFeatures, weights: FeatureWeights): number {
  return FEATURE_KEYS.reduce((acc, k) => acc + features[k] * weights[k], 0);
}

/**
 * 이 경로를 고르게 만든 성질 하나.
 * 추천 이유 한 줄을 쓰기 위해 필요하다 — 자동 추천의 생명줄.
 */
export function dominantFeature(
  features: RouteFeatures,
  weights: FeatureWeights
): FeatureKey {
  let best: FeatureKey = FEATURE_KEYS[0];
  let bestValue = -Infinity;
  for (const k of FEATURE_KEYS) {
    const contribution = features[k] * weights[k];
    if (contribution > bestValue) {
      bestValue = contribution;
      best = k;
    }
  }
  return best;
}

export function moodById(id: MoodId): Mood {
  const found = MOODS.find((m) => m.id === id);
  if (found == null) {
    throw new Error(`알 수 없는 기분: ${id}`);
  }
  return found;
}

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
  /**
   * 인용형. `routeReason`에서 "~ 하셔서"로 이어붙이는 형태다.
   *
   * 라벨을 정규식으로 활용형으로 바꾸려 했더니 여섯 중 셋이 비문이 됐다
   * ('생각이 많아다고', '긴장돼다고', '그냥 그래다고'). 한국어 활용은 어간마다
   * 달라서 규칙으로 못 만든다 — 그래서 각 기분이 제 인용형을 직접 들고 있는다.
   */
  quoted: string;
}

export const MOODS: Mood[] = [
  {
    id: 'pensive',
    label: '생각이 많아요',
    ack: '조용히 걸을 수 있게 할게요.',
    quoted: '생각이 많다고',
  },
  { id: 'excited', label: '설레요', ack: '기분 좋은 길로 갈게요.', quoted: '설렌다고' },
  { id: 'nervous', label: '긴장돼요', ack: '숨 고를 수 있는 길로 갈게요.', quoted: '긴장된다고' },
  { id: 'tired', label: '지쳤어요', ack: '힘 덜 드는 길로 갈게요.', quoted: '지쳤다고' },
  { id: 'hot', label: '햇볕이 싫어요', ack: '그늘을 최대한 찾아볼게요.', quoted: '햇볕이 싫다고' },
  { id: 'plain', label: '그냥 그래요', ack: '안 가본 길로 데려가 볼게요.', quoted: '그냥 그렇다고' },
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
 * 이 성질을 "이 길이 실제로 가진 것"이라고 말하려면 이 정도는 돼야 한다.
 *
 * 데이터를 못 받은 성질은 중립값 0.5로 둔다(`features.ts`). 그런데 가중치가 큰
 * 기분에서는 그 0.5가 그대로 최대 기여가 되어, 모르는 걸 이유로 내세우게 된다 —
 * 건물 높이를 하나도 못 받았는데 '햇볕이 싫어요'에 "그늘이 이어지는 길이에요"라고
 * 말하던 것이 그 경우다. 중립값보다 뚜렷하게 높은 것만 이유가 될 수 있다.
 */
const NOTABLE = 0.6;

/**
 * 이 경로를 고르게 만든 성질 하나. **없을 수도 있다.**
 *
 * 가중치를 곱한 기여가 가장 큰 것을 고르되, **이 길이 실제로 두드러진 성질**
 * 중에서만 고른다. 아무것도 두드러지지 않으면 null이고, 그러면 화면은
 * 이유를 아예 안 붙인다.
 *
 * 예전엔 두드러진 게 없으면 기여가 가장 큰 것을 그냥 골랐다. 바로 위
 * `NOTABLE`의 주석이 "중립값보다 뚜렷하게 높은 것만 이유가 될 수 있다"고 적어
 * 두고서 정작 그 아래에서 뒤집은 것이다. 그 폴백은 전부 중립값(0.5)인 길에서
 * 가중치가 가장 큰 성질을 뽑았고, 그 값은 **재본 적이 없는 값**이다 —
 * 횡단보도를 못 세는 공급자로 돌 때 '생각이 많아요'를 고르면 unbroken이 뽑혀
 * "신호에 거의 안 걸리는 길이에요"라고 말하게 된다. 세어 보지도 않고.
 *
 * 이유가 한 줄 비는 것은 손해가 아니다. 이 앱이 파는 것은 문장이 아니라
 * 제때 닿는다는 믿음이고, 근거 없는 문장은 그 믿음을 갉는다.
 */
export function dominantFeature(
  features: RouteFeatures,
  weights: FeatureWeights
): FeatureKey | null {
  let best: FeatureKey | null = null;
  let bestValue = -Infinity;

  for (const k of FEATURE_KEYS) {
    // 두드러지지 않은 성질은 후보가 아니다 — 재보지 못해 중립값인 것이 여기 걸린다.
    if (features[k] < NOTABLE) {
      continue;
    }
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

/**
 * 문구 생성.
 *
 * 자동 추천의 신뢰는 정확도가 아니라 설명에서 나온다.
 * "왜 이 길인지" 한 줄이 없으면 이 앱은 그냥 알 수 없는 우회길이 된다.
 */

import { moodById } from './mood';
import { ARRIVE_EARLY_MIN, formatDuration } from './time';
import type { FeatureKey, MoodId } from './types';
import type { WalkPlan } from './time';

/**
 * 성질별로 사람에게 하는 말. 기능 이름을 그대로 노출하지 않는다.
 *
 * **숫자를 말하지 않는다.** 예전엔 "신호등이 두 개뿐이라"고 적혀 있었는데,
 * 이 문장이 받는 건 성질 이름 하나뿐이라 실제 횡단보도 개수를 알지 못한다 —
 * 열 개인 길에도 "두 개뿐"이라고 말하고 있었다. 그늘을 지어내지 않기로 한 것과
 * 같은 이유로, 세어 보지 않은 수는 말하지 않는다.
 */
const FEATURE_REASON: Record<FeatureKey, string> = {
  quiet: '사람이 거의 없는 길이에요',
  flat: '오르막이 거의 없어요',
  shade: '이 시간엔 그늘이 이어지는 길이에요',
  scenic: '걷다 보면 볼 게 있는 길이에요',
  novelty: '아직 안 가보신 길이에요',
  unbroken: '신호등이 적어서 생각이 잘 안 끊겨요',
};

/**
 * 경로 추천 이유 한 줄.
 * "{기분}다고 하셔서, {성질}." 형태로 사용자의 말과 앱의 선택을 잇는다.
 *
 * 인용형은 `mood.ts`가 직접 들고 있다. 라벨에서 정규식으로 만들려 했더니
 * 여섯 중 셋이 비문이었다 — 이 한 줄이 자동 추천의 생명줄이라 문법이 틀리면
 * 설명이 아니라 흠집이 된다.
 */
export function routeReason(mood: MoodId, feature: FeatureKey): string {
  return `${moodById(mood).quoted} 하셔서, ${FEATURE_REASON[feature]}.`;
}

/**
 * 계획 종류에 따른 첫 화면 문구. 여유가 없을 때도 빈 화면을 보여주지 않는다.
 *
 * 걷는 시간은 바로 아래 큰 숫자가 이미 말한다. 여기서 또 "27분짜리"라고 하면
 * 한 화면에 같은 숫자가 두 번 나오고, 주인공이 둘이 된다.
 * 그래서 이 줄은 **약속**을 말하고, 숫자는 아래가 말하고, 이유는 그 아래가 말한다.
 * "찾아볼게요"도 아니다 — 길은 이미 찾아서 밑에 그려져 있다.
 */
export function planHeadline(plan: WalkPlan): string {
  switch (plan.kind) {
    case 'stretch':
      return plan.capped
        ? '시간이 꽤 남았어요.\n넉넉히 걸어볼까요?'
        : `${ARRIVE_EARLY_MIN}분 전에 닿는 길이에요.`;
    case 'straight':
      return plan.reason === 'no-early'
        ? `${ARRIVE_EARLY_MIN}분 전은 어렵겠어요. 오늘은 그냥 곧장 가요.`
        : '여유가 딱 그만큼이에요. 오늘은 그냥 곧장 가요.';
    case 'too-late':
      return `최단으로 가도 ${formatDuration(plan.shortBySec)} 늦어요.`;
  }
}

/**
 * 도착하고 약속까지 남은 시간의 화면. 이 앱의 시그니처 순간.
 *
 * 숫자는 말하지 않는다. 바로 위에 남은 시간이 큰 숫자로 떠 있는데 여기서 또
 * "5분 남았어요"라고 하면, 빨리 걸어 8분 일찍 닿은 사람에게는 두 값이 어긋난다.
 * 화면의 주인공은 그 숫자 하나이고, 이 문장은 그다음에 무엇을 할지만 건넨다.
 */
export function arrivalPrompt(companion: string | null): string {
  if (companion == null || companion.trim() === '') {
    return '숨 고르고,\n첫 마디를 생각해요.';
  }
  return `${companion}에게\n무슨 말부터 할까요?`;
}

/** 한 줄 기록을 청하는 말. 강요하지 않는 톤으로. */
export const NOTE_PLACEHOLDER = '걸으면서 무슨 생각 했어요?';

/** 예전에 걸었던 길의 그 지점을 다시 지날 때. */
export function memoryRecall(note: string, daysAgo: number): string {
  const when =
    daysAgo === 0
      ? '오늘'
      : daysAgo === 1
        ? '어제'
        : daysAgo < 30
          ? `${daysAgo}일 전`
          : `${Math.round(daysAgo / 30)}달 전`;
  return `${when} 여기서 "${note}"`;
}

/**
 * 가는 길에 스치는 가게 한 줄.
 * 권하는 말투가 아니라, 그냥 곁에 있다고 알려주는 정도. 우연의 여지를 남긴다.
 */
export function alongRouteHint(name: string): string {
  return `가는 길에 ${name}, 잠깐 들러도 좋고요`;
}

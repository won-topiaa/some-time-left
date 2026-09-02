/**
 * 문구 생성.
 *
 * 자동 추천의 신뢰는 정확도가 아니라 설명에서 나온다.
 * "왜 이 길인지" 한 줄이 없으면 이 앱은 그냥 알 수 없는 우회길이 된다.
 */

import { moodById } from './mood';
import {
  ARRIVE_EARLY_SEC,
  arriveEarlySecFor,
  formatDuration,
  isWetTarget,
  promisedMinutes,
} from './time';
import { precipNoun, type Weather } from './weather';
import type { FeatureKey, MoodId, WalkRecord } from './types';
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
      // 숫자는 계획이 겨눈 값이 아니라 지킬 수 있는 값(바닥)이다. 내리는 날은 숫자 대신 말로 —
      // "7분"은 정확하지만 우산 든 사람에게 필요한 말은 숫자가 아니라 여유를 뒀다는 사실이다.
      return plan.capped
        ? '시간이 꽤 남았어요.\n넉넉히 걸어볼까요?'
        : isWetTarget(plan.earlySec)
          ? `비 오는 날이라, ${promisedMinutes(ARRIVE_EARLY_SEC)}분보다 조금 더 일찍 닿는 길이에요.`
          : `${promisedMinutes(plan.earlySec)}분 전에는 닿는 길이에요.`;
    case 'straight':
      return plan.reason === 'no-early'
        ? isWetTarget(plan.earlySec)
          ? '비 오는 날인데 여유가 없네요. 오늘은 그냥 곧장 가요.'
          : `${promisedMinutes(plan.earlySec)}분 전은 어렵겠어요. 오늘은 그냥 곧장 가요.`
        : '여유가 딱 그만큼이에요. 오늘은 그냥 곧장 가요.';
    case 'too-late':
      return `최단으로 가도 ${formatDuration(plan.shortBySec)} 늦어요.`;
  }
}

/**
 * 첫 화면의 약속 한 줄.
 *
 * 맑은 날엔 "약속 3분 전에" — 지킬 수 있는 숫자(바닥)다. 내리는 날엔 숫자 대신
 * "3분보다 조금 더 일찍" — 그 이유(비·눈)와 함께. 맑은 날의 숫자를 기준으로 삼아
 * "그보다 더"라고만 말한다. 숫자가 어느 날 갑자기 5로 달라져 있으면
 * 앱이 틀린 것처럼 보이므로 달라진 날은 숫자를 말하지 않고 왜 달라졌는지를 말한다.
 * 날씨를 못 읽은 날은 맑은 날의 말이다.
 */
export function promiseLine(weather: Weather | null): string {
  const noun = weather == null ? null : precipNoun(weather.precip);
  return noun == null
    ? `약속 ${promisedMinutes(ARRIVE_EARLY_SEC)}분 전에 도착하게 해드릴게요.`
    : `${noun} 오는 날이라, 약속 ${promisedMinutes(ARRIVE_EARLY_SEC)}분 전보다 조금 더 일찍 도착하게 해드릴게요.`;
}

/**
 * 첫 화면 맨 아래, 스크롤을 내려야 보이는 **추신**.
 *
 * 첫 화면은 날씨 한 줄로 시작하는 편지다. 편지는 추신으로 끝난다 — 이 앱이 무엇을
 * 하는지는 맨 위에서 설명하지 않고 여기서 말한다. 위에서 말하면 안내문이 되고,
 * 아래에 두면 읽고 싶은 사람만 읽는 한 단락이 된다.
 *
 * 기능 목록이 아니다. 이 앱이 있는 이유인 **그 상황**에서 시작한다 — 약속 장소
 * 근처에 일찍 와 버려서, 카페에 들어가기엔 애매하고 서 있기엔 긴 시간. 그 시간을
 * 걷기로 쓰게 하는 것이 이 앱의 전부다. 숫자는 상수에서 온다.
 */
export function postscriptLines(): string[] {
  const promised = promisedMinutes(ARRIVE_EARLY_SEC);
  return [
    '약속 장소 근처에 일찍 와 버린 날이 있죠.\n카페에 들어가기엔 애매하고, 그냥 서 있기엔 긴 시간.',
    `그 시간만큼 걷는 길을 찾아드려요.\n가장 빠른 길 말고, 약속 ${promised}분 전에는 닿는 길로. 오늘 기분에 맞춰서요.`,
    '걷는 동안엔 남은 거리와 닿을 시각만 조용히 알려드려요.\n길에서 벗어나면 한 번 톡, 두드리고요.',
    '도착하면 몇 분이 남아 있어요.\n그 시간에 한 줄을 적어 두면, 지나온 길에 그대로 남아요.',
    `비 오는 날은 ${promised}분보다 조금 더 일찍 닿게 잡아요.\n우산을 접고 숨을 고를 시간이니까요.`,
  ];
}

export interface WalkFootnoteInput {
  destinationName: string;
  /** 계획이 약속 앞 목표를 겨눴고, 실제로도 그 언저리에 닿는가. */
  promiseHeld: boolean;
  /** 눈에 띄게 일찍 닿는 계획인가 (상한에서 잘렸거나 못 늘렸거나). */
  arrivesEarly: boolean;
  /** 그 계획이 겨눈 "약속 몇 초 전". */
  earlySec: number;
}

/**
 * 걷는 화면 맨 아래 한 줄 — 지금 무엇에 맞춰 걷고 있는가.
 *
 * 지킬 수 있는 말만 한다. 일찍 닿게 되는 계획은 약속 바로 앞에 맞추는 게 아니라
 * 그냥 넉넉히 걷는 것이므로 그렇게 말하고, 목표를 애초에 포기한 날(no-early)은
 * 지키지 못할 "N분 전"을 말하지 않는다. 숫자는 겨눈 값이 아니라 지킬 수 있는
 * 값(바닥)이고, 내리는 날은 그 숫자를 기준으로 "그보다 조금 더 일찍"이라고 말한다.
 */
export function walkFootnote({
  destinationName,
  promiseHeld,
  arrivesEarly,
  earlySec,
}: WalkFootnoteInput): string {
  const prefix = destinationName !== '' ? `${destinationName}까지 ` : '';
  const body = promiseHeld
    ? isWetTarget(earlySec)
      ? `비 오는 날이라 ${promisedMinutes(ARRIVE_EARLY_SEC)}분보다 조금 더 일찍 닿도록 맞추고 있어요.`
      : `${promisedMinutes(earlySec)}분 전에는 닿도록 맞추고 있어요.`
    : arrivesEarly
      ? '넉넉히 걷고 있어요.'
      : '제시간에 닿도록 걷고 있어요.';
  return prefix + body;
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

/**
 * 걸은 길 한 번을 남에게 보내는 문장.
 *
 * 이미지가 아니라 글이다. 토스가 주는 공유는 텍스트 한 덩어리라(`share({ message })`),
 * 그릇에 맞는 것을 담는다 — 리본을 그려 이미지로 만들려면 화면을 캡처하는 별도
 * 장치가 필요하고, 그건 이 기능이 주는 값보다 훨씬 무겁다.
 *
 * 자랑이 아니라 기록의 말투를 지킨다. 숫자를 앞세우지 않고, 남긴 한 줄이 있으면
 * 그게 주인공이 된다 — 화면에서 그랬던 것과 같다.
 */
export function walkShareText(
  record: Pick<WalkRecord, 'destinationName' | 'companion' | 'mood' | 'note'>,
  distanceM: number
): string {
  const where = record.destinationName.trim() !== '' ? record.destinationName : '어딘가';
  const km = (distanceM / 1000).toFixed(2);

  const lines = [
    record.companion.trim() !== ''
      ? `${record.companion} 만나러 ${where}까지, ${km}km 걸었어요.`
      : `${where}까지 ${km}km 걸었어요.`,
  ];

  if (record.note.trim() !== '') {
    lines.push('', `"${record.note.trim()}"`);
  }

  lines.push('', `— 자투리 시간 · ${moodById(record.mood).label} 걸었던 날`);
  return lines.join('\n');
}

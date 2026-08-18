/**
 * 기분 → 색.
 *
 * 발자취의 도트 지도가 조용해 보이는 이유는 색이 없어서가 아니라 **채도가 낮고
 * 명도가 서로 비슷해서**다. 여러 색이 한 화면에 있어도 하나가 튀지 않는다.
 * 여기서도 같은 규칙을 지킨다 — 여섯 색을 나란히 놓았을 때 어느 하나가
 * 먼저 눈에 들어오면 안 된다.
 *
 * 이 색은 크롬이 아니라 **내용**에만 쓴다. 지나온 길 하나하나가 그날의 기분 색을
 * 띠고, 그것들이 모여야 비로소 화면에 색이 생긴다.
 */

import type { MoodId } from '../domain/types';

export const MOOD_TINT: Record<MoodId, string> = {
  // 생각이 많아요 — 저녁의 남색
  pensive: '#5B6E8C',
  // 설레요 — 흙빛 주황. 여섯 중 유일하게 따뜻한 쪽으로 기운다.
  excited: '#C2795C',
  // 긴장돼요 — 숨 고르는 세이지
  nervous: '#7E9480',
  // 지쳤어요 — 흐린 자주
  tired: '#8E7C8B',
  // 햇볕이 싫어요 — 그늘의 이끼색(colors.shade와 같은 계열로 묶는다)
  hot: '#4B6B52',
  // 그냥 그래요 — 무채색에 가장 가깝게. 아무 기분도 아닌 날의 색.
  plain: '#9A9086',
};

export function moodTint(mood: MoodId): string {
  return MOOD_TINT[mood];
}

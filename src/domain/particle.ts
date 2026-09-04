/**
 * 한국어 조사 고르기.
 *
 * 첫 화면이 칸 세 개 대신 **한 문장**이 되면서 필요해졌다 —
 * "은지를 만나요"와 "지훈을 만나요"는 이름의 받침에 따라 갈린다. 여기서 틀리면
 * 편지처럼 읽히자고 만든 문장이 오히려 어색해진다.
 *
 * `mood.ts`는 활용형을 손으로 적어 뒀다('생각이 많다고', '설렌다고'). 어간마다
 * 달라 규칙으로 못 만들기 때문인데, **조사는 다르다.** 받침 유무만 보면 되고
 * 그건 유니코드에서 바로 나온다. 규칙이 있는 것은 규칙으로 푼다.
 */

/** 한글 음절 영역. 가(0xAC00) ~ 힣(0xD7A3). */
const HANGUL_FIRST = 0xac00;
const HANGUL_LAST = 0xd7a3;
/** 한 음절은 초성 19 × 중성 21 × 종성 28 로 배열되어 있다. */
const FINALS = 28;

/**
 * 마지막 글자에 받침이 있는가.
 *
 * 한글이 아니면 판단하지 않고 null을 준다 — 로마자나 숫자로 끝나는 이름
 * ('Amy', '카페404')은 읽는 사람마다 소리가 달라서, 규칙이 아니라 짐작이 된다.
 */
export function hasFinalConsonant(text: string): boolean | null {
  const trimmed = text.trim();
  if (trimmed === '') {
    return null;
  }
  const code = trimmed.charCodeAt(trimmed.length - 1);
  if (code < HANGUL_FIRST || code > HANGUL_LAST) {
    return null;
  }
  return (code - HANGUL_FIRST) % FINALS !== 0;
}

/**
 * 목적격 조사 — 을 / 를.
 *
 * 한글로 끝나지 않으면 '를'로 둔다. 둘 중 하나는 골라야 하는데, 로마자 이름을
 * 소리 나는 대로 읽으면 열린 소리로 끝나는 쪽이 많아서다('에이미를', '제이를').
 * 괄호를 쳐서 '을(를)'로 적는 방법도 있지만, 그건 서식이지 편지가 아니다.
 */
export function objectParticle(word: string): '을' | '를' {
  return hasFinalConsonant(word) === true ? '을' : '를';
}

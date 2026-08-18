/**
 * 조용한 톤. 지도 앱보다 편지에 가깝게.
 * 토스 안에서 열리므로 화면 자체는 익숙해야 하지만, 색은 우리 것을 쓴다.
 *
 * 레퍼런스(발자취·tash·Liltie)에서 가져온 원칙 세 가지:
 *
 * 1. **UI는 무채색, 색은 내용이 낸다.** 세 앱 모두 크롬(버튼·탭·카드)에는 색이
 *    거의 없고, 색은 사용자가 쌓아 올린 것 — 도트, 앨범 아트, 자기 글 — 에서만 나온다.
 *    그래서 강조색을 버튼에 바르지 않고, 기분 색(`moodTint.ts`)을 경로에 입힌다.
 * 2. **한 화면에 주인공은 하나.** 발자취의 거대한 누적 거리, Liltie의 가운데 질문처럼
 *    큰 것 하나만 두고 나머지는 작은 회색 글씨로 물러난다(`type.numeral` / `type.micro`).
 * 3. **면이 아니라 선과 여백으로 나눈다.** 카드를 채우는 대신 헤어라인 하나와
 *    넉넉한 여백으로 구분한다.
 */
export const colors = {
  /** 바탕. 흰색보다 조금 따뜻한 종이빛 — 이 앱이 도구가 아니라 편지인 이유. */
  bg: '#FAF9F6',
  surface: '#FFFFFF',
  ink: '#17181B',
  inkSoft: '#5A5F66',
  inkFaint: '#9BA1A8',
  /** 아직 채워지지 않은 자리. Liltie의 빈 요일 칸처럼 있음을 보여주되 비워둔다. */
  inkGhost: '#D3D5D8',
  /** 채도를 낮춘 남색. 링크와 조용한 강조에만 — 버튼을 칠하지 않는다. */
  accent: '#3F5A8A',
  accentSoft: '#E8EDF6',
  shade: '#4B6B52',
  /** 헤어라인. 면을 나누는 유일한 수단. */
  line: '#EBE8E2',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

export const type = {
  /**
   * 큰 숫자 하나. 발자취의 누적 거리처럼 굵기를 빼고 크기로만 말한다.
   * 굵게 만들면 강조가 아니라 소음이 된다.
   */
  numeral: { fontSize: 56, lineHeight: 64, fontWeight: '300' as const, letterSpacing: -1.5 },
  display: { fontSize: 28, lineHeight: 38, fontWeight: '700' as const },
  title: { fontSize: 21, lineHeight: 30, fontWeight: '600' as const },
  body: { fontSize: 16, lineHeight: 25, fontWeight: '400' as const },
  /**
   * 가장 작은 글씨. 레퍼런스의 곁다리 수치("22 / 25 · 3곳 남음")가 이 자리다.
   * 더 작은 단계는 두지 않는다 — 11px을 inkFaint로 얹어 보니 화면에서 읽히지 않았다.
   * 물러나게 하려면 크기를 더 줄이지 말고 색을 옅게 한다.
   */
  caption: { fontSize: 13, lineHeight: 19, fontWeight: '400' as const },
} as const;

/**
 * 조용한 톤. 지도 앱보다 편지에 가깝게.
 * 토스 안에서 열리므로 화면 자체는 익숙해야 하지만, 색은 우리 것을 쓴다.
 */
export const colors = {
  bg: '#F7F6F3',
  surface: '#FFFFFF',
  ink: '#1B1D21',
  inkSoft: '#5B6068',
  inkFaint: '#9AA0A8',
  accent: '#3F5A8A',
  accentSoft: '#E8EDF6',
  shade: '#4B6B52',
  line: '#E6E4DF',
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
  display: { fontSize: 28, lineHeight: 38, fontWeight: '700' as const },
  title: { fontSize: 21, lineHeight: 30, fontWeight: '600' as const },
  body: { fontSize: 16, lineHeight: 25, fontWeight: '400' as const },
  caption: { fontSize: 13, lineHeight: 19, fontWeight: '400' as const },
} as const;

/**
 * 테마 — 색과 글자를 지금 화면에 맞춰 고르는 자리.
 *
 * `theme.ts`(토큰)와 나눠 둔다. 저쪽은 값만 있는 순수한 파일이라 노드에서 그대로
 * 읽히고(스토어 그림 스크립트와 테스트가 그렇게 쓴다), 이 파일은 리액트 네이티브를
 * 부르므로 앱 안에서만 산다. 한 파일에 두면 스크립트가 RN을 못 찾아 멈춘다.
 */

import { colors, type } from './theme';

/*
 * 토스는 앱을 열 때 사용자의 설정을 함께 넘겨준다(`initialColorPreference`,
 * `initialFontSize`). 그동안 우리는 그걸 무시하고 종이빛 하나로만 그렸다 —
 * 밤에 토스 안에서 열면 이 앱만 혼자 눈부시고, 큰 글씨를 쓰는 사람에게는
 * 우리 글자만 작았다.
 */

import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { useInitialProps, type InitialProps } from '@granite-js/react-native';

/** `as const`로 굳은 리터럴이라 그대로 쓰면 다른 색을 넣을 수 없다. 폭을 넓혀 둔다. */
export type Palette = { -readonly [K in keyof typeof colors]: string };
export type TypeScale = { -readonly [K in keyof typeof type]: (typeof type)[K] };
export type Scheme = 'light' | 'dark';

/**
 * 어두운 화면의 색.
 *
 * 밝은 쪽을 그대로 뒤집지 않았다. 이 앱의 바탕은 순백이 아니라 종이빛인데,
 * 어두운 쪽에서 순검정을 쓰면 그 성질이 사라진다 — 파랑이 아주 조금 도는
 * 잉크빛으로 두고, 그 위에 놓이는 것들도 같은 온도를 갖게 했다.
 *
 * 강조색은 밝은 쪽보다 밝게 잡는다. 어두운 바탕에서는 같은 남색이 검게 가라앉는다.
 */
const DARK: Palette = {
  bg: '#16181C',
  surface: '#1E2126',
  ink: '#ECEDEF',
  inkSoft: '#A8ADB5',
  inkFaint: '#71767E',
  inkGhost: '#3A3E45',
  accent: '#8FA9D8',
  accentSoft: '#242A36',
  shade: '#8FB899',
  line: '#2B2F36',
};

const PALETTES: Record<Scheme, Palette> = { light: colors, dark: DARK };

/**
 * 토스 앱의 글자 크기 설정 → 배율.
 *
 * 기기 설정(OS)과는 별개인 토스 자체 설정이라 리액트 네이티브가 알지 못한다.
 * 모르는 값이 오면 1로 둔다 — 지어낸 배율로 화면을 흔드느니 그대로 두는 게 낫다.
 */
const FONT_SCALE: Record<string, number> = {
  Small: 0.9,
  Medium: 1,
  Large: 1.15,
  ExtraLarge: 1.3,
  Largest: 1.45,
};

/**
 * 토스가 넘겨주는 초기값 중 우리가 읽는 것.
 *
 * `initialFontSize`는 granite의 기본 타입에 없다(토스가 얹어 준다). 없을 수도
 * 있다고 보고 느슨하게 읽는다 — 없으면 배율 1로 물러선다.
 */
type TossInitialProps = InitialProps & {
  initialFontSize?: string;
};

export interface Theme {
  scheme: Scheme;
  colors: Palette;
  type: TypeScale;
}

/**
 * 지금 화면이 써야 할 색과 글자.
 *
 * 색은 토스가 넘겨준 `initialColorPreference`를 먼저 본다. 그게 토스 안에서
 * 사용자가 고른 테마고, 우리 화면을 감싸고 있는 게 바로 그 테마다 — OS는 어둡고
 * 토스는 밝게 둔 사람에게 우리만 어둡게 뜨면 토스 안에서 혼자 다른 화면이 된다.
 * 기기 설정(`useColorScheme`)은 그 값이 없을 때만 본다.
 *
 * 대신 앱이 떠 있는 동안 OS 테마가 바뀌는 건 못 따라간다. 초기값은 이름 그대로
 * 처음 한 번이다. 걷는 몇십 분 사이에 테마를 바꾸는 일은 드물고, 토스를 밝게
 * 두고 쓰는 사람이 매번 어두운 화면을 보는 것보다는 그쪽이 낫다.
 */
export function useTheme(): Theme {
  const initial = useInitialProps<TossInitialProps>();
  const live = useColorScheme();
  const scheme: Scheme =
    initial.initialColorPreference ?? (live === 'dark' || live === 'light' ? live : 'light');
  const fontScale = FONT_SCALE[initial.initialFontSize ?? ''] ?? 1;

  return useMemo(
    () => ({ scheme, colors: PALETTES[scheme], type: scaleType(fontScale) }),
    [scheme, fontScale]
  );
}

/**
 * 글자 배율 적용 — 토스 글자 크기 설정만 곱한다.
 *
 * 기기(OS) 배율은 여기서 곱하지 않는다. 리액트 네이티브가 `<Text>`를 그릴 때
 * `allowFontScaling`(기본 켜짐)으로 `fontSize`와 `lineHeight` **둘 다**에 기기
 * 배율을 한 번 더 곱한다 — 안드로이드는 sp 변환, iOS는 fontSizeMultiplier.
 *
 * 전에는 `lineHeight`에만 기기 배율을 직접 곱했다. "리액트 네이티브는 줄 높이는
 * 안 건드린다"는 전제였는데 틀렸고, 그러면 줄 높이가 두 번 커진다(1.3배 설정에서
 * 글자 1.3배, 줄 높이 1.69배). 큰 글씨를 쓰는 바로 그 사람들 화면에서 줄이
 * 벌어지고 고정 높이 상자가 잘렸다.
 */
function scaleType(scale: number): TypeScale {
  if (scale === 1) {
    return type;
  }

  const scaled = Object.entries(type).map(([name, token]) => [
    name,
    {
      ...token,
      fontSize: Math.round(token.fontSize * scale),
      lineHeight: Math.round(token.lineHeight * scale),
    },
  ]);

  return Object.fromEntries(scaled) as TypeScale;
}

/**
 * 테마에 맞춘 스타일.
 *
 * 화면들은 `StyleSheet.create`를 모듈 바깥에 두고 있었는데, 그러면 테마가 바뀌어도
 * 색이 안 바뀐다. 만드는 함수로 바꿔 여기서 부른다 — 인자 이름을 `colors`, `type`으로
 * 두면 스타일 본문은 한 글자도 고칠 게 없다.
 *
 * 테마가 그대로면 다시 만들지 않는다. 화면이 1초에 한 번 다시 그려지는 자리
 * (걷는 화면)가 있어서, 그때마다 StyleSheet를 새로 만들면 그게 곧 낭비다.
 */
export function useStyles<T>(factory: (colors: Palette, type: TypeScale) => T): T {
  const theme = useTheme();
  return useMemo(() => factory(theme.colors, theme.type), [factory, theme]);
}

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
import { PixelRatio, useColorScheme } from 'react-native';
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
 * 색은 `useColorScheme()`을 먼저 본다 — 앱이 떠 있는 동안 사용자가 설정을 바꾸면
 * 그때 따라가야 하는데, 초기값은 이름 그대로 처음 한 번뿐이라 그걸 못 잡는다.
 * 리액트 네이티브가 모르면(null) 토스가 넘겨준 값으로 물러선다.
 */
export function useTheme(): Theme {
  const initial = useInitialProps<TossInitialProps>();
  const live = useColorScheme();
  const scheme: Scheme =
    live === 'dark' || live === 'light' ? live : (initial.initialColorPreference ?? 'light');
  const fontScale = FONT_SCALE[initial.initialFontSize ?? ''] ?? 1;

  return useMemo(
    () => ({ scheme, colors: PALETTES[scheme], type: scaleType(fontScale) }),
    [scheme, fontScale]
  );
}

/**
 * 글자 배율 적용.
 *
 * `fontSize`만 곱한다 — 리액트 네이티브가 `<Text>`를 그릴 때 기기 설정(OS)의
 * 배율을 자기가 한 번 더 곱해 주기 때문이다.
 *
 * `lineHeight`는 기기 배율을 **직접** 곱해 준다. 리액트 네이티브는 여기까지는
 * 손대지 않아서, 큰 글씨 설정에서 글자만 커지고 줄 높이는 그대로면 위아래가 잘린다.
 */
function scaleType(scale: number): TypeScale {
  if (scale === 1 && PixelRatio.getFontScale() === 1) {
    return type;
  }

  const deviceScale = PixelRatio.getFontScale();
  const scaled = Object.entries(type).map(([name, token]) => [
    name,
    {
      ...token,
      fontSize: Math.round(token.fontSize * scale),
      lineHeight: Math.round(token.lineHeight * scale * deviceScale),
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

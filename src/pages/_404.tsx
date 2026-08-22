/**
 * 없는 주소로 들어왔을 때.
 *
 * **이 파일은 선택이 아니다.** granite 라우터는 화면 목록에서 `/_404`를 찾지
 * 못하면 그리기도 전에 던진다 —
 *
 *   `getScreenPathMapConfig` (router/utils/screen.tsx)
 *   404 page not found. Please create a `_404.ts` or `_404.tsx` file ...
 *
 * 그 던짐은 `useRouterControls` 안, 우리 ErrorBoundary보다 **위쪽**에서 일어나서
 * `_app.tsx`의 오류 화면조차 뜨지 않는다. 남는 건 흰 화면뿐이다.
 * 화면을 하나도 안 만들어도 이 파일만은 있어야 한다.
 *
 * 내용은 조용하게 둔다. 여기 온 사람은 잘못한 게 없고, 대개는 옛 링크다.
 * 사과문을 길게 쓰는 대신 돌아갈 곳 하나만 준다.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createRoute, useNavigation } from '@granite-js/react-native';
import { radius, spacing } from '../ui/theme';
import { type Palette, type TypeScale, useStyles } from '../ui/useTheme';
import { useScreenInsets } from '../ui/screenInsets';

export const Route = createRoute('/_404', {
  component: NotFound,
});

function NotFound() {
  const styles = useStyles(createStyles);
  const navigation = useNavigation();
  const screen = useScreenInsets();

  return (
    <View style={[styles.screen, { paddingTop: screen.top, paddingBottom: screen.bottom }]}>
      <Text style={styles.headline}>여긴 아무것도 없어요.</Text>
      <Text style={styles.sub}>주소가 바뀌었거나 지워진 화면이에요.</Text>

      <Pressable
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        onPress={() => navigation.navigate('/')}
      >
        <Text style={styles.backText}>처음으로</Text>
      </Pressable>
    </View>
  );
}

const createStyles = (colors: Palette, type: TypeScale) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.bg,
      paddingHorizontal: spacing.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headline: { ...type.title, color: colors.ink, textAlign: 'center' },
    sub: {
      ...type.caption,
      color: colors.inkFaint,
      textAlign: 'center',
      marginTop: spacing.sm,
    },
    // 면을 칠하지 않는다. 이 앱에서 버튼은 헤어라인으로만 자기 자리를 알린다.
    back: {
      marginTop: spacing.xl,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xl,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.line,
    },
    backText: { ...type.body, color: colors.inkSoft },
    pressed: { opacity: 0.6 },
  });

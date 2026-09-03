import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createRoute, useNavigation } from '@granite-js/react-native';
import { generateHapticFeedback } from '@apps-in-toss/framework';
import { MOODS } from '../domain/mood';
import { radius, spacing } from '../ui/theme';
import { type Palette, type TypeScale, useStyles, useTheme } from '../ui/useTheme';
import { useScreenInsets } from '../ui/screenInsets';
import { moodTint } from '../ui/moodTint';
import { useTrip } from '../state/TripContext';
import type { MoodId } from '../domain/types';

export const Route = createRoute('/mood', {
  component: Mood,
  // 토스 내비게이션 바의 뒤로가기와 겹치지 않게 라우터 기본 헤더는 끈다.
  screenOptions: { headerShown: false },
});

/**
 * 이 화면이 제품의 성격을 결정한다.
 * 경사·혼잡도 같은 조건은 여기에 없다. 기분만 고르면 나머지는 앱이 정한다.
 */
function Mood() {
  const { scheme } = useTheme();
  const styles = useStyles(createStyles);
  const navigation = useNavigation();
  const { trip, update } = useTrip();
  const screen = useScreenInsets();

  const choose = (mood: MoodId) => {
    generateHapticFeedback({ type: 'tickWeak' }).catch(() => {});
    update({ mood });
    navigation.navigate('/route');
  };

  return (
    <View style={[styles.screen, { paddingTop: screen.top, paddingBottom: screen.bottom }]}>
      <Text style={styles.question}>
        {trip.companion.trim() === ''
          ? '지금 기분이 어때요?'
          : `${trip.companion} 만나러 가는 길,\n지금 기분이 어때요?`}
      </Text>

      {/*
        면을 채우지 않는다. 흰 카드 여섯 장을 쌓으면 종이 위가 아니라 목록 화면이 된다 —
        이 앱이 스스로 정한 "선과 여백으로만 나눈다"를 가장 크게 어기는 자리였다.
        헤어라인만 두면 색을 가진 건 기분 점 여섯 개뿐이 되고, 그게 원래 의도다.
      */}
      <View style={styles.cards}>
        {MOODS.map((mood) => (
          <Pressable
            key={mood.id}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            onPress={() => choose(mood.id)}
          >
            {/* 기분마다 제 색을 가진 점. 여기서 고른 색이 길에 입혀지고 기록에 남는다. */}
            <View style={[styles.dot, { backgroundColor: moodTint(mood.id, scheme) }]} />
            <Text style={styles.rowText}>{mood.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.footnote}>고르면 알아서 길을 찾아드려요.</Text>
    </View>
  );
}

const createStyles = (colors: Palette, type: TypeScale) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.bg,
      paddingHorizontal: spacing.lg,
      justifyContent: 'center',
    },
    pressed: { opacity: 0.6 },
    question: {
      ...type.display,
      color: colors.ink,
      marginBottom: spacing.xl,
    },
    // 맨 윗줄에도 선을 둬서 여섯 줄이 한 덩어리로 보이게 한다.
    cards: { borderTopWidth: 1, borderTopColor: colors.line },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      // 손가락이 닿는 자리는 넉넉히. 줄로 나눠도 누르기 편해야 한다.
      paddingVertical: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
    },
    dot: { width: 10, height: 10, borderRadius: radius.pill },
    rowText: { ...type.title, color: colors.ink },
    footnote: {
      ...type.caption,
      color: colors.inkFaint,
      marginTop: spacing.lg,
      textAlign: 'center',
    },
  });

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createRoute, useNavigation } from '@granite-js/react-native';
import { generateHapticFeedback } from '@apps-in-toss/framework';
import { MOODS } from '../domain/mood';
import { colors, radius, spacing, type } from '../ui/theme';
import { useTrip } from '../state/TripContext';
import type { MoodId } from '../domain/types';

export const Route = createRoute('/mood', {
  component: Mood,
});

/**
 * 이 화면이 제품의 성격을 결정한다.
 * 경사·혼잡도 같은 조건은 여기에 없다. 기분만 고르면 나머지는 앱이 정한다.
 */
function Mood() {
  const navigation = useNavigation();
  const { trip, update } = useTrip();

  const choose = (mood: MoodId) => {
    generateHapticFeedback({ type: 'tickWeak' }).catch(() => {});
    update({ mood, shownRouteIds: [] });
    navigation.navigate('/route');
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.question}>
        {trip.companion.trim() === ''
          ? '지금 기분이 어때요?'
          : `${trip.companion} 만나러 가는 길,\n지금 기분이 어때요?`}
      </Text>

      <View style={styles.cards}>
        {MOODS.map((mood) => (
          <Pressable key={mood.id} style={styles.card} onPress={() => choose(mood.id)}>
            <Text style={styles.cardText}>{mood.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.footnote}>고르면 알아서 길을 찾아드려요.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  question: {
    ...type.display,
    color: colors.ink,
    marginBottom: spacing.xl,
  },
  cards: { gap: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  cardText: { ...type.title, color: colors.ink },
  footnote: {
    ...type.caption,
    color: colors.inkFaint,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
});

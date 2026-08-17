import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { createRoute, useNavigation } from '@granite-js/react-native';
import { colors, radius, spacing, type } from '../ui/theme';
import { useTrip } from '../state/TripContext';
import { formatClock } from '../domain/time';

export const Route = createRoute('/', {
  component: Home,
});

/** 약속 시각을 오늘 기준으로. 30분 단위 프리셋이 타이핑보다 빠르다. */
function presetTimes(nowMs: number): number[] {
  const base = new Date(nowMs);
  base.setSeconds(0, 0);
  const step = 30 * 60 * 1000;
  const firstSlot = Math.ceil((base.getTime() + 20 * 60 * 1000) / step) * step;
  return [0, 1, 2, 3].map((i) => firstSlot + i * step);
}

function Home() {
  const navigation = useNavigation();
  const { trip, update } = useTrip();
  const [nowMs] = useState(() => Date.now());

  const canProceed = trip.destinationName.trim() !== '' && trip.arriveAtMs != null;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.hello}>시간이 좀 남았네요.</Text>
        <Text style={styles.sub}>약속 3분 전에 도착하게 해드릴게요.</Text>
      </View>

      <Text style={styles.label}>어디로 가세요?</Text>
      <TextInput
        style={styles.input}
        placeholder="약속 장소"
        placeholderTextColor={colors.inkFaint}
        value={trip.destinationName}
        onChangeText={(destinationName) => update({ destinationName })}
      />

      <Text style={styles.label}>몇 시 약속이에요?</Text>
      <View style={styles.chips}>
        {presetTimes(nowMs).map((ms) => {
          const selected = trip.arriveAtMs === ms;
          return (
            <Pressable
              key={ms}
              style={[styles.chip, selected && styles.chipOn]}
              onPress={() => update({ arriveAtMs: ms })}
            >
              <Text style={[styles.chipText, selected && styles.chipTextOn]}>
                {formatClock(ms)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>누구를 만나요?</Text>
      <TextInput
        style={styles.input}
        placeholder="비워두셔도 괜찮아요"
        placeholderTextColor={colors.inkFaint}
        value={trip.companion}
        onChangeText={(companion) => update({ companion })}
      />

      <View style={styles.spacer} />

      <Pressable
        style={[styles.cta, !canProceed && styles.ctaOff]}
        disabled={!canProceed}
        onPress={() => navigation.navigate('/mood')}
      >
        <Text style={styles.ctaText}>다음</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  header: { marginTop: spacing.xl, marginBottom: spacing.xl },
  hello: { ...type.display, color: colors.ink },
  sub: { ...type.body, color: colors.inkSoft, marginTop: spacing.sm },
  label: { ...type.caption, color: colors.inkSoft, marginBottom: spacing.sm },
  input: {
    ...type.body,
    color: colors.ink,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.accent },
  chipText: { ...type.body, color: colors.inkSoft },
  chipTextOn: { color: colors.surface, fontWeight: '600' },
  spacer: { flex: 1 },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
  },
  ctaOff: { backgroundColor: colors.inkFaint },
  ctaText: { ...type.title, color: colors.surface },
});

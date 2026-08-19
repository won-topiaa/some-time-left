import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { createRoute, useNavigation } from '@granite-js/react-native';
import { colors, radius, spacing, type } from '../ui/theme';
import { useTrip } from '../state/TripContext';
import { usePlaceSearch } from '../state/usePlaceSearch';
import { formatClock } from '../domain/time';
import type { Place } from '../data/places';

export const Route = createRoute('/', {
  component: Home,
});

/** 약속 시각을 오늘 기준으로. 30분 단위 프리셋이 타이핑보다 빠르다. */
function presetTimes(nowMs: number): number[] {
  const step = 30 * 60 * 1000;
  const baseMs = nowMs - (nowMs % 1000);
  const firstSlot = Math.ceil((baseMs + 20 * 60 * 1000) / step) * step;
  return [0, 1, 2, 3].map((i) => firstSlot + i * step);
}

function Home() {
  const navigation = useNavigation();
  const { trip, update } = useTrip();
  const [nowMs] = useState(() => Date.now());
  const [query, setQuery] = useState('');
  const { results, searching, available } = usePlaceSearch(query);

  // 검색 결과에서 고르기 전에는 좌표가 없다. 좌표 없이는 경로를 찾을 수 없다.
  const canProceed = trip.destination != null && trip.arriveAtMs != null;

  const pick = (place: Place) => {
    update({
      destinationName: place.name,
      destination: place.at,
      destinationPoiId: place.poiId ?? null,
    });
    setQuery('');
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.hello}>시간이 좀 남았네요.</Text>
        <Text style={styles.sub}>약속 3분 전에 도착하게 해드릴게요.</Text>
      </View>

      <Text style={styles.label}>어디로 가세요?</Text>
      {trip.destination != null ? (
        <Pressable
          style={styles.picked}
          onPress={() =>
            update({ destinationName: '', destination: null, destinationPoiId: null })
          }
        >
          <Text style={styles.pickedName}>{trip.destinationName}</Text>
          <Text style={styles.pickedChange}>변경</Text>
        </Pressable>
      ) : (
        <>
          <TextInput
            style={styles.input}
            placeholder={available ? '약속 장소' : '약속 장소 (검색 키 미설정)'}
            placeholderTextColor={colors.inkFaint}
            value={query}
            onChangeText={setQuery}
          />
          {results.length > 0 && (
            <ScrollView style={styles.results} keyboardShouldPersistTaps="handled">
              {results.map((place) => (
                <Pressable
                  key={`${place.name}-${place.at.lat}-${place.at.lng}`}
                  style={styles.result}
                  onPress={() => pick(place)}
                >
                  <Text style={styles.resultName}>{place.name}</Text>
                  {place.address !== '' && (
                    <Text style={styles.resultAddress}>{place.address}</Text>
                  )}
                </Pressable>
              ))}
            </ScrollView>
          )}
          {searching && results.length === 0 && (
            <Text style={styles.searching}>찾는 중...</Text>
          )}
        </>
      )}

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
        <Text style={[styles.ctaText, !canProceed && styles.ctaTextOff]}>다음</Text>
      </Pressable>

      {/* 지나온 길은 목적이 아니라 뒤돌아보는 자리다. 그래서 맨 아래, 가장 옅게. */}
      <Pressable style={styles.trace} onPress={() => navigation.navigate('/trace')}>
        <Text style={styles.traceText}>지나온 길</Text>
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
  chipOn: { backgroundColor: colors.ink },
  chipText: { ...type.body, color: colors.inkSoft },
  chipTextOn: { color: colors.surface, fontWeight: '600' },
  picked: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickedName: { ...type.body, color: colors.ink, flexShrink: 1 },
  pickedChange: { ...type.caption, color: colors.accent, marginLeft: spacing.sm },
  results: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
    maxHeight: 220,
  },
  result: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  resultName: { ...type.body, color: colors.ink },
  resultAddress: { ...type.caption, color: colors.inkFaint, marginTop: 2 },
  searching: { ...type.caption, color: colors.inkFaint, marginBottom: spacing.lg },
  spacer: { flex: 1 },
  // 버튼은 먹색. 색은 크롬이 아니라 쌓인 기록이 낸다.
  cta: {
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
  },
  // 꺼진 버튼도 글자는 읽혀야 한다. inkGhost 위 흰 글자는 대비가 거의 없다.
  ctaOff: { backgroundColor: colors.line },
  ctaTextOff: { color: colors.inkFaint },
  ctaText: { ...type.title, color: colors.surface },
  trace: { paddingVertical: spacing.md, alignItems: 'center' },
  traceText: { ...type.caption, color: colors.inkFaint },
});

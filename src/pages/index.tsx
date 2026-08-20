import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { createRoute, useKeyboardHeight, useNavigation } from '@granite-js/react-native';
import { colors, radius, spacing, type } from '../ui/theme';
import { useScreenInsets } from '../ui/screenInsets';
import { useTrip } from '../state/TripContext';
import { usePlaceSearch } from '../state/usePlaceSearch';
import { formatClock } from '../domain/time';
import type { Place } from '../data/places';

export const Route = createRoute('/', {
  component: Home,
});

/** 프리셋 한 칸의 간격 (ms). */
const SLOT_MS = 30 * 60 * 1000;

/** 미세 조정 한 번의 크기 (ms). 30분 격자에 안 걸리는 약속을 위해. */
const NUDGE_MS = 5 * 60 * 1000;

/** 지금부터 이만큼은 지나야 걸어갈 수 있다 (ms). */
const LEAD_MS = 20 * 60 * 1000;

/** 약속 시각을 오늘 기준으로. 30분 단위 프리셋이 타이핑보다 빠르다. */
function presetTimes(nowMs: number): number[] {
  const baseMs = nowMs - (nowMs % 1000);
  const firstSlot = Math.ceil((baseMs + LEAD_MS) / SLOT_MS) * SLOT_MS;
  return [0, 1, 2, 3].map((i) => firstSlot + i * SLOT_MS);
}

function Home() {
  const navigation = useNavigation();
  const { trip, update } = useTrip();
  const screen = useScreenInsets();
  const keyboardHeight = useKeyboardHeight();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [query, setQuery] = useState('');
  const { results, searching, available } = usePlaceSearch(query);

  const slots = useMemo(() => presetTimes(nowMs), [nowMs]);

  /**
   * 이 화면은 스택 맨 아래에 계속 살아 있다. 한 번 걷고 돌아오거나 잠깐 딴짓을 하면
   * 처음 켤 때 만든 시각들이 그대로 남아, 앱이 제안한 시각이 이미 지난 시각이 된다.
   * 다시 보일 때마다 시각을 새로 잡고, 지나 버린 선택은 조용히 비운다.
   */
  const refreshNow = useCallback(() => {
    const fresh = Date.now();
    setNowMs(fresh);
    if (trip.arriveAtMs != null && trip.arriveAtMs < fresh + LEAD_MS) {
      update({ arriveAtMs: null });
    }
  }, [trip.arriveAtMs, update]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', refreshNow);
    return unsubscribe;
  }, [navigation, refreshNow]);

  // 검색 결과에서 고르기 전에는 좌표가 없다. 좌표 없이는 경로를 찾을 수 없다.
  const canProceed = trip.destination != null && trip.arriveAtMs != null;

  // 프리셋 격자에 딱 맞지 않는 시각(2시 45분 같은)을 고른 상태인가.
  const nudged = trip.arriveAtMs != null && !slots.includes(trip.arriveAtMs);

  const nudge = (deltaMs: number) => {
    if (trip.arriveAtMs == null) {
      return;
    }
    const next = trip.arriveAtMs + deltaMs;
    // 지금 걸어서 닿을 수 없는 시각으로는 못 내린다.
    if (next < Date.now() + LEAD_MS) {
      return;
    }
    update({ arriveAtMs: next });
  };

  const pick = (place: Place) => {
    update({
      destinationName: place.name,
      destination: place.at,
      destinationPoiId: place.poiId ?? null,
    });
    setQuery('');
  };

  return (
    <View style={[styles.screen, { paddingTop: screen.top }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.hello}>시간이 좀 남았네요.</Text>
          <Text style={styles.sub}>약속 3분 전에 도착하게 해드릴게요.</Text>
        </View>

        <Text style={styles.label}>어디로 가세요?</Text>
        {trip.destination != null ? (
          <Pressable
            style={({ pressed }) => [styles.picked, pressed && styles.pressed]}
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
              <ScrollView
                style={styles.results}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
              >
                {results.map((place) => (
                  <Pressable
                    key={`${place.name}-${place.at.lat}-${place.at.lng}`}
                    style={({ pressed }) => [styles.result, pressed && styles.pressed]}
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
          {slots.map((ms) => {
            const selected = trip.arriveAtMs === ms;
            return (
              <Pressable
                key={ms}
                style={({ pressed }) => [
                  styles.chip,
                  selected && styles.chipOn,
                  pressed && styles.pressed,
                ]}
                onPress={() => update({ arriveAtMs: ms })}
              >
                <Text style={[styles.chipText, selected && styles.chipTextOn]}>
                  {formatClock(ms)}
                </Text>
              </Pressable>
            );
          })}
          {/*
            30분 격자에 안 걸리는 약속(2시 45분)이 더 많다. 격자만 주면
            18분 일찍 가거나 12분 늦게 가는 수밖에 없어 이 앱의 존재 이유가 흔들린다.
            고른 뒤에만 조용히 나타나는 미세 조정이라 처음 화면은 그대로 단순하다.
          */}
          {nudged && (
            <View style={styles.nudgedChip}>
              <Text style={styles.chipTextOn}>{formatClock(trip.arriveAtMs as number)}</Text>
            </View>
          )}
        </View>

        {trip.arriveAtMs != null && (
          <View style={styles.nudgeRow}>
            <Pressable
              style={({ pressed }) => [styles.nudge, pressed && styles.pressed]}
              onPress={() => nudge(-NUDGE_MS)}
            >
              <Text style={styles.nudgeText}>5분 일찍</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.nudge, pressed && styles.pressed]}
              onPress={() => nudge(NUDGE_MS)}
            >
              <Text style={styles.nudgeText}>5분 늦게</Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.label}>누구를 만나요?</Text>
        <TextInput
          style={styles.input}
          placeholder="비워두셔도 괜찮아요"
          placeholderTextColor={colors.inkFaint}
          value={trip.companion}
          onChangeText={(companion) => update({ companion })}
        />
      </ScrollView>

      <View style={{ paddingBottom: keyboardHeight > 0 ? keyboardHeight : screen.bottom }}>
        <Pressable
          style={({ pressed }) => [
            styles.cta,
            !canProceed && styles.ctaOff,
            pressed && canProceed && styles.pressed,
          ]}
          disabled={!canProceed}
          onPress={() => navigation.navigate('/mood')}
        >
          <Text style={[styles.ctaText, !canProceed && styles.ctaTextOff]}>다음</Text>
        </Pressable>

        {/* 지나온 길은 목적이 아니라 뒤돌아보는 자리다. 그래서 맨 아래, 가장 옅게. */}
        <Pressable
          style={({ pressed }) => [styles.trace, pressed && styles.pressed]}
          onPress={() => navigation.navigate('/trace')}
        >
          <Text style={styles.traceText}>지나온 길</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  content: { paddingBottom: spacing.lg },
  header: { marginBottom: spacing.xl },
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
  chipTextOn: { ...type.body, color: colors.surface, fontWeight: '600' },
  // 미세 조정으로 격자를 벗어난 시각. 고른 칩과 같은 모습이되 누를 수는 없다 —
  // 조정은 아래 두 링크가 맡는다.
  nudgedChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
  },
  nudgeRow: { flexDirection: 'row', gap: spacing.lg, marginBottom: spacing.lg },
  // 조정은 조용해야 한다. 버튼이 아니라 곁말처럼.
  nudge: { paddingVertical: spacing.xs },
  nudgeText: { ...type.caption, color: colors.inkSoft, textDecorationLine: 'underline' },
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
  // 눌린 걸 알리는 유일한 수단. 색을 바꾸지 않고 옅어지기만 한다.
  pressed: { opacity: 0.6 },
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

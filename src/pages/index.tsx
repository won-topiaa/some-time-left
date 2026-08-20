import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { createRoute, useKeyboardHeight, useNavigation } from '@granite-js/react-native';
import { colors, radius, spacing, type } from '../ui/theme';
import { useScreenInsets } from '../ui/screenInsets';
import { useTrip } from '../state/TripContext';
import { usePlaceSearch } from '../state/usePlaceSearch';
import { useWeather } from '../state/useWeather';
import { dayLabel, formatClock, resolveAppointment } from '../domain/time';
import { NO_CARRIED, loadCarried, loadRecords } from '../data/records';
import { formatTotalDistance, traceSummary } from '../domain/trace';
import type { Place } from '../data/places';

export const Route = createRoute('/', {
  component: Home,
});

/**
 * 시각을 적는 칸.
 *
 * 30분 격자 프리셋을 네 칸 놓아 봤는데, 실제 약속은 2시 45분이나 7시 10분처럼
 * 격자에 안 걸리는 쪽이 더 많았다. 격자에 맞추려고 '5분 일찍/늦게'를 붙이자
 * 한 번에 고르던 것이 세 번 누르는 일이 됐다 — 그럴 바에는 적는 편이 빠르다.
 */
const HOUR_PLACEHOLDER = '6';
const MINUTE_PLACEHOLDER = '30';

/** 숫자만 남긴다. 한글 자판이 켜져 있어도 칸이 더러워지지 않게. */
function digitsOnly(text: string, max: number): string {
  return text.replace(/[^0-9]/g, '').slice(0, max);
}

function Home() {
  const navigation = useNavigation();
  const { trip, update } = useTrip();
  const screen = useScreenInsets();
  const keyboardHeight = useKeyboardHeight();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [query, setQuery] = useState('');
  const [hourText, setHourText] = useState('');
  const [minuteText, setMinuteText] = useState('');
  /** null이면 앱이 다가오는 쪽으로 읽는다. 고르면 그 뜻이 이긴다. */
  const [period, setPeriod] = useState<'am' | 'pm' | null>(null);
  const minuteRef = useRef<TextInput>(null);
  const { results, searching, available } = usePlaceSearch(query);
  // 편지의 첫 줄. 못 읽으면 null이고, 그러면 그 줄은 없다.
  const weather = useWeather();
  // 지금까지 걸은 거리. 없으면 null이라 아무것도 덧붙이지 않는다.
  const [walkedKm, setWalkedKm] = useState<string | null>(null);

  /**
   * 쌓인 걸 첫 화면에서도 보이게 한다.
   *
   * 기록이 쌓이는 게 보여야 기록이라는 게 이 앱의 원칙인데, 정작 그 화면으로 가는 문은
   * 맨 아래 흐린 글씨 하나였다 — 뭐가 들어 있는지 알 수 없으니 열어 볼 이유도 없다.
   * 숫자를 그 문에 얹으면 주인공을 뺏지 않으면서 쌓인 게 보인다.
   * 걷고 돌아올 때마다 늘어나야 하므로 화면이 다시 보일 때 함께 새로 읽는다.
   */
  const refreshWalked = useCallback(() => {
    Promise.all([loadRecords().catch(() => []), loadCarried().catch(() => NO_CARRIED)])
      .then(([records, carried]) => {
        const list = Array.isArray(records) ? records : [];
        if (list.length === 0 && carried.count === 0) {
          setWalkedKm(null);
          return;
        }
        setWalkedKm(formatTotalDistance(traceSummary(list, carried).totalDistanceM));
      })
      .catch(() => setWalkedKm(null));
  }, []);

  /**
   * 이 화면은 스택 맨 아래에 계속 살아 있다. 한 번 걷고 돌아오거나 잠깐 딴짓을 하면
   * 처음 켤 때 잡은 '지금'이 그대로 남는다. 다시 보일 때마다 새로 잡는다.
   *
   * 고른 것을 지우지는 않는다. 적어 둔 "6:30"은 시각이 지나면 사라질 게 아니라
   * 내일 6:30으로 읽히면 되는 것이고, `resolveAppointment`가 그렇게 한다.
   * 촉박한 약속은 길 찾기 화면이 "지금 나서는 게 최선이에요"라고 정직하게 말한다.
   */
  const refreshNow = useCallback(() => {
    setNowMs(Date.now());
  }, []);

  // 첫 진입에도 한 번 읽는다 — 'focus'는 이미 보이고 있는 첫 화면에는 안 올 수 있다.
  useEffect(refreshWalked, [refreshWalked]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      refreshNow();
      refreshWalked();
    });
    return unsubscribe;
  }, [navigation, refreshNow, refreshWalked]);

  /**
   * 적은 시각을 실제 시각으로. 못 읽으면 null이고, 그때는 다음 버튼이 잠긴다.
   * 두 글자를 적는 중인 사람에게 빨간 글씨를 띄우지는 않는다.
   */
  const arriveAtMs = useMemo(
    () =>
      hourText === '' || minuteText === ''
        ? null
        : resolveAppointment(
            { hour12: Number(hourText), minute: Number(minuteText), period },
            nowMs
          ),
    [hourText, minuteText, period, nowMs]
  );

  // 읽어낸 시각을 이동에 싣는다. 화면이 계산한 것과 길 찾기가 쓰는 것이 하나여야 한다.
  useEffect(() => {
    if (trip.arriveAtMs !== arriveAtMs) {
      update({ arriveAtMs });
    }
  }, [arriveAtMs, trip.arriveAtMs, update]);

  // 검색 결과에서 고르기 전에는 좌표가 없다. 좌표 없이는 경로를 찾을 수 없다.
  const canProceed = trip.destination != null && arriveAtMs != null;

  /**
   * 시를 두 자리까지 적었으면 분으로 넘겨준다.
   * 한 손으로 적는 화면이라 칸을 손가락으로 옮기게 하지 않는다.
   */
  const onHour = (text: string) => {
    const next = digitsOnly(text, 2);
    setHourText(next);
    // '1'은 1시일 수도 12시일 수도 있어 기다린다. 2~9는 한 자리로 끝난다.
    if (next.length === 2 || (next.length === 1 && Number(next) >= 2)) {
      minuteRef.current?.focus();
    }
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
          {/*
            편지가 날씨 이야기로 시작하듯 맨 위에 한 줄.
            가장 작고 가장 옅게 둔다 — 주인공은 아래 인사말 하나다.
          */}
          {weather != null && <Text style={styles.weather}>{weather}</Text>}
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
              // 키가 없다는 건 우리 사정이지 쓰는 사람 사정이 아니다.
              // "검색 키 미설정" 같은 말이 화면에 나오면 안 된다.
              placeholder={available ? '약속 장소' : '지금은 장소를 찾을 수 없어요'}
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
            {/*
              찾다가 아무것도 없으면 화면이 그냥 조용해져서, 검색이 도는 중인지
              결과가 없는 건지 알 수 없었다. 모르는 채로 두지 않는다.
            */}
            {searching && results.length === 0 && (
              <Text style={styles.searching}>찾는 중...</Text>
            )}
            {!searching && results.length === 0 && query.trim().length >= 2 && (
              <Text style={styles.searching}>찾는 곳이 없어요. 다르게 적어 볼까요?</Text>
            )}
          </>
        )}

        <Text style={styles.label}>몇 시 약속이에요?</Text>
        <View style={styles.clockRow}>
          {/*
            오전/오후는 안 골라도 된다. 안 고르면 다가오는 쪽으로 읽고, 그 결과를
            바로 아래 줄에 적어 둔다 — 조용히 정해 버리면 약속에 늦는 친절이 된다.
          */}
          <View style={styles.periods}>
            {(['am', 'pm'] as const).map((p) => {
              const on = period === p;
              return (
                <Pressable
                  key={p}
                  style={({ pressed }) => [styles.period, on && styles.periodOn, pressed && styles.pressed]}
                  onPress={() => setPeriod(on ? null : p)}
                >
                  <Text style={[styles.periodText, on && styles.periodTextOn]}>
                    {p === 'am' ? '오전' : '오후'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.clock}>
            <TextInput
              style={styles.clockField}
              value={hourText}
              onChangeText={onHour}
              placeholder={HOUR_PLACEHOLDER}
              placeholderTextColor={colors.inkGhost}
              keyboardType="number-pad"
              maxLength={2}
              textAlign="center"
              returnKeyType="next"
            />
            <Text style={styles.colon}>:</Text>
            <TextInput
              ref={minuteRef}
              style={styles.clockField}
              value={minuteText}
              onChangeText={(text) => setMinuteText(digitsOnly(text, 2))}
              placeholder={MINUTE_PLACEHOLDER}
              placeholderTextColor={colors.inkGhost}
              keyboardType="number-pad"
              maxLength={2}
              textAlign="center"
              returnKeyType="done"
            />
          </View>
        </View>

        {/*
          적은 것이 언제로 읽혔는지 되돌려 준다. "6:30"은 오늘 저녁일 수도
          내일 아침일 수도 있어서, 이 한 줄이 없으면 앱만 알고 사람은 모른다.
        */}
        <Text style={styles.reading}>
          {arriveAtMs != null
            ? `${dayLabel(arriveAtMs, nowMs)} ${formatClock(arriveAtMs)}`
            : ' '}
        </Text>

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

        {/*
          지나온 길은 목적이 아니라 뒤돌아보는 자리다. 그래서 맨 아래, 가장 옅게.
          다만 얼마나 쌓였는지는 여기서 보인다 — 걷고 돌아올 때마다 이 숫자가 늘고,
          그게 이 앱에서 유일하게 쌓이는 것이다.
        */}
        <Pressable
          style={({ pressed }) => [styles.trace, pressed && styles.pressed]}
          onPress={() => navigation.navigate('/trace')}
        >
          <Text style={styles.traceText}>
            지나온 길{walkedKm != null && ` · ${walkedKm}km`}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  content: { paddingBottom: spacing.lg },
  header: { marginBottom: spacing.xl },
  weather: { ...type.caption, color: colors.inkFaint, marginBottom: spacing.sm },
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
  /** 오전/오후와 시각이 한 줄. 두 덩어리 사이는 여백으로만 나눈다. */
  clockRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  periods: { flexDirection: 'row', gap: spacing.sm },
  period: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  periodOn: { backgroundColor: colors.ink },
  periodText: { ...type.body, color: colors.inkSoft },
  periodTextOn: { ...type.body, color: colors.surface, fontWeight: '600' },
  /** 시각 두 칸. 목적지·상대 칸과 같은 흰 면이라 적는 자리로 읽힌다. */
  clock: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
  },
  clockField: {
    ...type.title,
    color: colors.ink,
    // 두 자리가 들어갈 만큼만. 넓으면 숫자가 칸 안에서 떠다닌다.
    width: 44,
    paddingVertical: spacing.sm + 2,
  },
  colon: { ...type.title, color: colors.inkFaint, marginHorizontal: 2 },
  /**
   * 적은 것이 언제로 읽혔는지. 비어 있어도 자리는 지킨다 —
   * 이 줄이 생겼다 사라지면 아래 칸들이 그때마다 들썩인다.
   */
  reading: {
    ...type.caption,
    color: colors.inkSoft,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
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

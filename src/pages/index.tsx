import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  createRoute,
  useKeyboardHeight,
  useNavigation,
  useVisibilityChange,
  type VisibilityState,
} from '@granite-js/react-native';
import { radius, spacing } from '../ui/theme';
import { type Palette, type TypeScale, useStyles, useTheme } from '../ui/useTheme';
import { useScreenInsets } from '../ui/screenInsets';
import { useTrip } from '../state/TripContext';
import { usePlaceSearch } from '../state/usePlaceSearch';
import { useWeather } from '../state/useWeather';
import { arriveEarlySecFor, dayLabel, formatClock, resolveAppointment } from '../domain/time';
import { postscriptGroups, promiseLine } from '../domain/copy';
import { objectParticle } from '../domain/particle';
import { spareSpan } from '../domain/spare-time';
import { RevealOnScroll } from '../ui/RevealOnScroll';
import { SpareLine } from '../ui/SpareLine';
import { weatherLine } from '../domain/weather';
import {
  NO_CARRIED,
  loadCarried,
  loadRecords,
  recentPlaces,
  type RecentPlace,
} from '../data/records';
import { formatTotalDistance, traceSummary } from '../domain/trace';
import type { Place } from '../data/places';

export const Route = createRoute('/', {
  component: Home,
  // 토스 내비게이션 바가 이미 뒤로가기를 그린다. 라우터 기본 헤더까지 켜 두면
  // 뒤로가기 버튼이 두 개가 된다 — 실제로 심사에서 그렇게 지적받았다.
  screenOptions: { headerShown: false },
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
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
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
  const { results, searching } = usePlaceSearch(query);
  // 화면이 다시 보인 횟수. 날씨를 그때마다 다시 읽는다(요청은 10분 캐시가 받는다).
  const [shownCount, setShownCount] = useState(0);
  // 편지의 첫 줄이자 "몇 분 전"의 갈림. 못 읽으면 null이고, 그러면 그 줄은 없고 맑은 날이다.
  const weather = useWeather(shownCount);
  // 지금까지 걸은 거리. 없으면 null이라 아무것도 덧붙이지 않는다.
  const [walkedKm, setWalkedKm] = useState<string | null>(null);
  /** 최근에 간 곳. 좌표가 남아 있는 기록에서만 온다. */
  const [recent, setRecent] = useState<RecentPlace[]>([]);

  /*
   * 추신을 스크롤에 맞춰 펴 보이기 위한 것들.
   *
   * 스크롤 위치는 Animated.Value로 받는다 — 상태로 받으면 스크롤하는 내내 첫 화면
   * 전체가 초당 수십 번 다시 그려지고, Hermes에는 JIT이 없어 그 값이 그대로 든다.
   */
  const scrollY = useRef(new Animated.Value(0)).current;
  const [viewportHeight, setViewportHeight] = useState(0);
  /** 추신 상자가 스크롤 내용에서 앉은 자리. 묶음들의 좌표는 이 값 기준이다. */
  const [postscriptTop, setPostscriptTop] = useState(0);
  /** 움직임을 줄여 달라고 한 기기에서는 그냥 다 보여준다. */
  const [animate, setAnimate] = useState(true);
  const groups = useMemo(() => postscriptGroups(), []);

  useEffect(() => {
    let cancelled = false;
    // 이 런타임에 없을 수도 있다. 없으면 움직이는 쪽으로 둔다 — 꾸미는 일이라
    // 못 물어봤다고 화면이 달라질 이유는 없다.
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((reduce) => {
        if (!cancelled) {
          setAnimate(!reduce);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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
        // 최근 목적지는 같은 기록에서 나온다. 저장소를 한 번 더 읽지 않는다.
        setRecent(recentPlaces(list));
        if (list.length === 0 && carried.count === 0) {
          setWalkedKm(null);
          return;
        }
        setWalkedKm(formatTotalDistance(traceSummary(list, carried).totalDistanceM));
      })
      .catch(() => {
        setWalkedKm(null);
        setRecent([]);
      });
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

  /** 지금 이 화면이 보이는가. 아래 타이머가 배경에서 돌지 않게 하는 데 쓴다. */
  const [focused, setFocused] = useState(true);

  /*
   * '지금'을 흘려 준다.
   *
   * 남은 시간을 선으로 그리기 시작하면서 이 값이 화면에 직접 보이게 됐다
   * ("지금 12:43"). 화면에 들어올 때만 잡으면 적는 동안 그 숫자가 멈춰 있고,
   * 선의 길이도 같이 멈춘다. 분 단위로 보여주므로 30초면 충분히 자주다.
   *
   * **보이는 동안만 돈다.** 이 화면은 스택 맨 아래에 계속 살아 있어서, 막아 두지
   * 않으면 걷는 내내 배경에서 '지금'이 흐른다. 그러면 약속 시각이 지나는 순간
   * `resolveAppointment`가 그 시각을 **내일로** 굴리고, 그 값이 아래 effect를 타고
   * 이동에 그대로 실린다 — 도착 화면의 카운트다운이 0:00에서 719:59로 튀고,
   * 길 찾기는 24시간짜리 여유로 다시 계획한다. 걷고 있는 사람의 약속을
   * 첫 화면이 배경에서 바꿔 놓는 셈이다.
   */
  useEffect(() => {
    if (!focused) {
      return;
    }
    const timer = setInterval(refreshNow, 30_000);
    return () => clearInterval(timer);
  }, [refreshNow, focused]);

  useEffect(() => {
    const onFocus = navigation.addListener('focus', () => {
      setFocused(true);
      refreshNow();
      refreshWalked();
    });
    const onBlur = navigation.addListener('blur', () => setFocused(false));
    return () => {
      onFocus();
      onBlur();
    };
  }, [navigation, refreshNow, refreshWalked]);

  /**
   * 화면이 다시 보일 때 — 다른 화면에서 돌아올 때뿐 아니라 **딴 앱에 갔다 돌아올 때도.**
   *
   * 내비게이션 'focus'는 뒤의 경우에 오지 않는다. 아침에 켜 둔 채 잠갔다가 저녁에
   * 다시 열어 약속을 적는 사람에게는 그새 시작된 비가 곧 "몇 분 전"이라, 여기서
   * 날씨와 '지금'을 다시 잡는다. 처음 보일 때는 건너뛴다 — 마운트 때 이미 읽고 있다.
   */
  const seenOnce = useRef(false);
  const onVisibility = useCallback(
    (state: VisibilityState) => {
      if (state !== 'visible') {
        return;
      }
      if (!seenOnce.current) {
        seenOnce.current = true;
        return;
      }
      refreshNow();
      setShownCount((n) => n + 1);
    },
    [refreshNow]
  );
  useVisibilityChange(onVisibility);

  // 읽은 날씨를 이동에 싣는다. 길 찾기·걷기 화면이 "몇 분 전"을 같은 날씨로 내야 한다.
  // `reset()`이 지운 뒤에도 값이 같으면 effect가 안 돌므로, 이동 쪽 값과 비교해 되채운다.
  useEffect(() => {
    if (trip.weather !== weather) {
      update({ weather });
    }
  }, [weather, trip.weather, update]);

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

  /**
   * 지금과 약속 사이를 세 도막으로. 그릴 것이 없으면 null.
   *
   * 약속 앞 여백은 오늘 날씨가 정한다 — 비 오는 날은 그만큼 넓다. 다음 화면들이
   * 쓰는 값과 같은 함수에서 나와야 그림과 계획이 어긋나지 않는다.
   */
  const span = useMemo(
    () => (arriveAtMs == null ? null : spareSpan(nowMs, arriveAtMs, arriveEarlySecFor(weather))),
    [nowMs, arriveAtMs, weather]
  );

  // 검색 결과에서 고르기 전에는 좌표가 없다. 좌표 없이는 경로를 찾을 수 없다.
  const canProceed = trip.destination != null && arriveAtMs != null;

  /**
   * 다음 버튼이 왜 안 눌리는지.
   *
   * 없으면 화면이 조용히 죽은 버튼만 보여준다 — 목적지를 적기만 하고 **결과를
   * 안 골랐거나**, 시각이 안 읽히는 값(둘 중 하나가 비었거나 분이 60 이상)일 때가
   * 그렇다. 사용자는 무엇이 모자란지 알 방법이 없다. 모르는 채로 두지 않는다.
   *
   * 아직 아무것도 안 한 사람에게는 말하지 않는다. 시작하자마자 부족하다고
   * 말하는 화면은 재촉이 된다.
   */
  const touched = query.trim() !== '' || hourText !== '' || minuteText !== '';
  const missing = canProceed || !touched
    ? null
    : trip.destination == null
      ? '검색 결과에서 장소를 한 번 골라주세요.'
      : '몇 시 몇 분인지 채워주세요.';

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
    });
    setQuery('');
  };

  return (
    <View style={[styles.screen, { paddingTop: screen.top }]}>
      <Animated.ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        // 추신이 언제 화면에 들어오는지 재려면 스크롤 영역의 높이가 필요하다.
        onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
      >
        <View style={styles.header}>
          {/*
            편지가 날씨 이야기로 시작하듯 맨 위에 한 줄.
            가장 작고 가장 옅게 둔다 — 주인공은 아래 인사말 하나다.
          */}
          {weather != null && <Text style={styles.weather}>{weatherLine(weather)}</Text>}
          <Text style={styles.hello}>시간이 좀 남았네요.</Text>
          {/* 맑은 날은 "3분 전"(지킬 수 있는 숫자), 내리는 날은 숫자 대신 "조금 더 일찍". */}
          <Text style={styles.sub}>{promiseLine(weather)}</Text>
        </View>

        {/*
          추신. 편지의 인사말 바로 아래, 입력칸들 위에 둔다.

          세 묶음이 스크롤을 내리는 만큼 차례로 떠오른다. 다섯 문단을 한꺼번에
          깔았더니 읽기도 전에 밀린다는 말을 들었고, 실제로 편지를 통째로
          들이미는 모양이었다. 자리는 처음부터 잡아 두고 투명도만 오간다 —
          나타날 때 자리를 만들면 손가락 밑에서 글이 밀린다.
        */}
        <View
          style={styles.postscript}
          // 묶음들이 스크롤 내용 어디에 앉았는지 재려면 이 상자의 자리가 필요하다.
          onLayout={(event) => setPostscriptTop(event.nativeEvent.layout.y)}
        >
          <Text style={styles.postscriptLabel}>추신</Text>
          {groups.map((group, index) => (
            <RevealOnScroll
              key={group[0]}
              scrollY={scrollY}
              viewportHeight={viewportHeight}
              offsetY={postscriptTop}
              enabled={animate}
              style={index > 0 ? styles.postscriptGroup : undefined}
            >
              {group.map((line) => (
                <Text key={line} style={styles.postscriptLine}>
                  {line}
                </Text>
              ))}
            </RevealOnScroll>
          ))}
        </View>

        {/*
          칸 세 개가 아니라 문장 하나.

          "어디로 가세요?" "몇 시 약속이에요?" "누구를 만나요?" 세 질문에 회색
          상자가 셋 달려 있었다. 물어보는 말은 다정한데 답하는 자리가 서류라서,
          이 앱이 편지처럼 읽히려던 것이 그 자리에서 끊겼다.

          이제 빈칸을 채우면 문장이 완성된다. 상자를 걷어내고 밑줄만 남기는 건
          이 앱이 스스로 정한 원칙이기도 하다 — 면이 아니라 선과 여백으로 나눈다
          (theme.ts). 입력칸은 그 원칙을 지키지 않던 유일한 자리였다.
        */}
        <View style={styles.sentence}>
          {/* 언제 */}
          <View style={styles.line}>
            {/*
              오전/오후는 안 골라도 된다. 안 고르면 다가오는 쪽으로 읽고, 그 결과를
              아래 줄에 적어 둔다 — 조용히 정해 버리면 약속에 늦는 친절이 된다.
            */}
            <View style={styles.periods}>
              {(['am', 'pm'] as const).map((p, i) => {
                const on = period === p;
                return (
                  <View key={p} style={styles.periodWrap}>
                    {i === 1 && <Text style={styles.periodDot}>·</Text>}
                    <Pressable
                      style={({ pressed }) => [styles.period, pressed && styles.pressed]}
                      onPress={() => setPeriod(on ? null : p)}
                    >
                      <Text style={[styles.periodText, on && styles.periodTextOn]}>
                        {p === 'am' ? '오전' : '오후'}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>

            <View style={styles.blank}>
              <TextInput
                style={styles.blankField}
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
                style={styles.blankField}
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
            <Text style={styles.particle}>에</Text>
          </View>

          {/* 어디서 */}
          <View style={styles.line}>
            {trip.destination != null ? (
              <Pressable
                style={({ pressed }) => [styles.blank, styles.blankWide, pressed && styles.pressed]}
                onPress={() => update({ destinationName: '', destination: null })}
              >
                <Text style={styles.blankValue} numberOfLines={1}>
                  {trip.destinationName}
                </Text>
                {/*
                  누르면 지워진다는 걸 알린다. 밑줄만 남기면서 이 칸이 적는 칸과
                  똑같이 생기게 됐는데, 적으려고 누른 사람의 선택이 말없이
                  사라지면 다음 버튼이 왜 죽었는지도 알 수 없다.
                */}
                <Text style={styles.change}>변경</Text>
              </Pressable>
            ) : (
              <View style={[styles.blank, styles.blankWide]}>
                <TextInput
                  style={styles.blankValue}
                  placeholder="약속 장소"
                  placeholderTextColor={colors.inkGhost}
                  value={query}
                  onChangeText={setQuery}
                />
              </View>
            )}
            <Text style={styles.particle}>에서</Text>
          </View>

          {/* 고르는 자리는 문장 안이 아니라 그 아래에 편다. */}
          {trip.destination == null && (
            <>
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

              {/*
                최근에 간 곳. 매주 같은 곳에서 만나는 사람이 매번 같은 이름을
                검색하는 건 이 앱이 없애기로 한 종류의 수고다. 적기 시작하면
                감춘다 — 검색 결과와 나란히 두면 무엇을 고르는 자리인지 흐려진다.
              */}
              {recent.length > 0 && query.trim() === '' && (
                <View style={styles.recent}>
                  {recent.map((place) => (
                    <Pressable
                      key={place.name}
                      style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
                      // 검색 결과를 고를 때와 같은 길로 간다. 고르는 방식이 바뀌면
                      // 칩도 같이 바뀌어야지, 두 갈래로 놔두면 한쪽만 고쳐진다.
                      onPress={() => pick({ ...place, address: '' })}
                    >
                      <Text style={styles.chipText} numberOfLines={1}>
                        {place.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </>
          )}

          {/* 누구를 */}
          <View style={styles.line}>
            <View style={[styles.blank, styles.blankWide]}>
              <TextInput
                style={styles.blankValue}
                placeholder="누구"
                placeholderTextColor={colors.inkGhost}
                value={trip.companion}
                onChangeText={(companion) => update({ companion })}
              />
            </View>
            {/*
              받침에 따라 을/를이 갈린다. 여기서 틀리면 편지처럼 읽히자고 만든
              문장이 오히려 어색해진다. 비워 두면 '누구를 만나요.'로 읽혀서,
              비워도 괜찮다는 말을 따로 적지 않아도 된다.
            */}
            <Text style={styles.particle}>
              {objectParticle(trip.companion.trim() !== '' ? trip.companion : '누구')} 만나요.
            </Text>
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

        {/*
          그리고 그 시간이 얼마나 되는지를 눈으로 보여준다.

          이 줄이 생기기 전까지 첫 화면은 시각을 받아 놓고도 "오늘 오후 1시 20분"
          이라고만 되돌려 줬다. 맞는 말이지만 그 줄로는 이 앱이 무엇을 하는
          앱인지 알 수 없었다 — 추신을 읽은 사람만 알았다.
        */}
        {span != null && arriveAtMs != null && (
          <SpareLine span={span} nowMs={nowMs} arriveAtMs={arriveAtMs} />
        )}

      </Animated.ScrollView>

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

        {missing != null && <Text style={styles.missing}>{missing}</Text>}

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

const createStyles = (colors: Palette, type: TypeScale) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
    /*
      최근에 간 곳. 칩은 이 앱에서 유일하게 테두리로 자기를 알리는 요소라,
      면을 칠하지 않는다는 원칙을 여기서도 지킨다.
    */
    recent: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
    chip: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.line,
      maxWidth: '100%',
    },
    chipText: { ...type.caption, color: colors.inkSoft },
    // 죽은 버튼 밑에 이유 한 줄. 재촉이 아니라 안내라서 가장 옅게 둔다.
    missing: {
      ...type.caption,
      color: colors.inkFaint,
      textAlign: 'center',
      marginTop: spacing.sm,
    },
    content: { paddingBottom: spacing.lg },
    header: { marginBottom: spacing.xl },
    weather: { ...type.caption, color: colors.inkFaint, marginBottom: spacing.sm },
    hello: { ...type.display, color: colors.ink },
    sub: { ...type.body, color: colors.inkSoft, marginTop: spacing.sm },
    /*
      문장 한 줄. 빈칸과 조사가 밑선을 공유해야 한 문장으로 읽힌다.

      wrap을 켜 둔다 — 시스템 글꼴을 키우면 "다래식당"과 "에서"가 한 줄에 못 들어가는데,
      그때 넘치는 대신 접혀야 조사가 잘리지 않는다.
    */
    sentence: { marginTop: spacing.sm },
    line: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      flexWrap: 'wrap',
      marginBottom: spacing.xl,
    },
    /*
      빈칸. 면을 칠하지 않고 밑줄만 둔다.

      이 앱은 "면이 아니라 선과 여백으로 나눈다"를 원칙으로 적어 뒀는데(theme.ts),
      입력칸만 흰 면을 칠하고 있었다 — 원칙을 지키지 않던 유일한 자리였다.
      밑줄은 채워야 할 자리라는 뜻도 같이 낸다.
    */
    blank: {
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: colors.inkGhost,
      paddingBottom: spacing.xs,
      // 비어 있어도 밑줄이 보일 만큼은 남긴다. 없으면 빈칸이 사라져 누를 자리가 없다.
      minWidth: 72,
    },
    /** 이름이 들어가는 칸은 남는 너비를 가져간다. */
    blankWide: { flexGrow: 1, flexShrink: 1 },
    /** 시각 두 칸. 두 자리가 들어갈 만큼만 — 넓으면 숫자가 칸 안에서 떠다닌다. */
    blankField: { ...type.title, color: colors.ink, width: 44, paddingVertical: 2 },
    blankValue: { ...type.title, color: colors.ink, flex: 1, paddingVertical: 2 },
    /** 고른 장소를 무르는 자리. 링크색으로만 알린다 — 면도 테두리도 두지 않는다. */
    change: { ...type.caption, color: colors.accent, marginLeft: spacing.sm },
    colon: { ...type.title, color: colors.inkFaint, marginHorizontal: 2 },
    /** 조사. 문장을 잇는 말이라 값보다 한 단계 물러난다. */
    particle: {
      ...type.body,
      color: colors.inkSoft,
      marginLeft: spacing.sm,
      // 큰 글씨의 밑선에 맞춰 앉힌다.
      marginBottom: spacing.xs,
    },
    /*
      오전·오후. 알약을 칠하지 않고 글자만 진하게 한다.

      예전엔 먹색으로 채운 알약이었는데, 문장 안에 놓으니 그것만 버튼처럼 튀어
      문장이 끊겼다. 고른 쪽이 진하고 안 고른 쪽이 옅으면 그걸로 충분하다.
    */
    periods: { flexDirection: 'row', alignItems: 'flex-end', marginRight: spacing.md },
    periodWrap: { flexDirection: 'row', alignItems: 'flex-end' },
    periodDot: { ...type.body, color: colors.inkGhost, marginHorizontal: 4, marginBottom: spacing.xs },
    period: { paddingBottom: spacing.xs, paddingHorizontal: 2 },
    periodText: { ...type.body, color: colors.inkGhost },
    periodTextOn: { color: colors.ink, fontWeight: '600' },
    /**
     * 적은 것이 언제로 읽혔는지. 비어 있어도 자리는 지킨다 —
     * 이 줄이 생겼다 사라지면 아래가 그때마다 들썩인다.
     */
    reading: { ...type.caption, color: colors.inkSoft },
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
    /**
     * 추신. 인사말 아래, 입력칸 위. 위아래 헤어라인으로 나눈다.
     * 처음 켠 사람이 스크롤하며 읽고 나면 바로 아래 입력칸이 기다린다.
     */
    postscript: {
      marginTop: spacing.lg,
      marginBottom: spacing.xl,
      paddingTop: spacing.lg,
      paddingBottom: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: colors.line,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
    },
    postscriptLabel: { ...type.caption, color: colors.inkFaint },
    // 문단 사이를 넉넉히 — 천천히 스크롤하며 한 문단씩 읽는 리듬을 여백이 만든다.
    postscriptLine: { ...type.body, color: colors.inkSoft, marginTop: spacing.lg },
    /** 묶음 사이는 문단 사이보다 넓게 — 마디가 바뀐다는 걸 여백이 먼저 말한다. */
    postscriptGroup: { marginTop: spacing.md },
  });

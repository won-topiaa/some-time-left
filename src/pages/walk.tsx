import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createRoute, useNavigation } from '@granite-js/react-native';
import { Accuracy, setScreenAwakeMode, startUpdateLocation } from '@apps-in-toss/framework';
import { distanceM, walkProgress } from '../domain/geo';
import { DEFAULT_WALK_SPEED_MPS, estimateSpeedMps, paceAdvice } from '../domain/pace';
import { ARRIVE_EARLY_SEC, arrivalAt, formatDuration } from '../domain/time';
import { colors, radius, spacing, type } from '../ui/theme';
import { useScreenInsets } from '../ui/screenInsets';
import { useTrip } from '../state/TripContext';
import type { LatLng } from '../domain/types';

export const Route = createRoute('/walk', {
  component: Walk,
});

/** 도착 판정 반경 (m). */
const ARRIVED_RADIUS_M = 40;

/**
 * 위치가 이만큼 안 들어오면 "못 잡고 있다"고 본다 (ms).
 *
 * 첫 측정까지는 원래 몇 초 걸리므로(timeInterval 3초) 바로 경고하면
 * 걷기 시작할 때마다 "위치가 안 잡혀요"가 번쩍인다. 그 정상 구간은 지나 보낸다.
 */
const LOCATION_GRACE_MS = 20_000;

/**
 * 걷는 중 화면.
 *
 * 경로를 다시 그리는 대신 속도를 미세 조정하게 한다.
 * 사람에게는 "다른 길로 가세요"보다 "조금 천천히 걸어도 돼요"가 훨씬 자연스럽다.
 */
function Walk() {
  const navigation = useNavigation();
  const { trip, update } = useTrip();
  const screen = useScreenInsets();
  const [remainingM, setRemainingM] = useState<number | null>(null);
  const [speedMps, setSpeedMps] = useState(DEFAULT_WALK_SPEED_MPS);
  // 계획을 세운 시계와 같은 시계로 센다. 기기 시계가 몇 분 틀어져 있으면
  // 화면마다 남은 시간이 달라지고, 3분을 약속한 앱이 스스로 거짓말을 하게 된다.
  const offset = trip.clockOffsetMs;
  const [nowMs, setNowMs] = useState(() => Date.now() + offset);
  // 위치를 놓쳤는가. 놓친 채로 페이스를 코칭하면 잘 걷는 사람에게 서두르라고 한다.
  const [locationLost, setLocationLost] = useState(false);
  // nowMs와 같은(보정된) 시계로 찍어 둔다. 한쪽만 보정하면 뺄셈이 흐른 시간이 아니게 된다.
  const [startedAtMs] = useState(() => Date.now() + offset);

  const samples = useRef<{ distanceFromPrevM: number; elapsedSec: number }[]>([]);
  const previous = useRef<{ at: LatLng; ms: number } | null>(null);
  /**
   * 지금 넘어가는 중인가. 40m 안쪽 측정이 연달아 들어와도 navigate는 한 번만.
   * 화면이 다시 보이면 풀어 준다 — 안 풀면 '이미 도착했어요'가 영영 먹통이 된다.
   */
  const navigating = useRef(false);
  /**
   * 자동으로 도착 처리를 한 적이 있는가. **이건 풀지 않는다.**
   *
   * 도착 화면에서 뒤로 나온 사람은 일부러 나온 것이다. 목적지 코앞이라 위치는
   * 여전히 40m 안쪽이므로, 다시 켜진 GPS가 측정을 하나 주는 순간 곧바로 도착 화면으로
   * 되돌려 보내게 된다 — 나올 수 없는 화면이 된다. 자동은 한 번이면 족하고,
   * 그 뒤로는 본인이 누를 때만 넘어간다.
   */
  const autoArrived = useRef(false);
  /**
   * 지금까지 온 만큼(0~1). 뒤로 미끄러지지 않게 들고 있는다.
   * 일부러 늘린 길은 제 옆을 스치기도 해서, 이걸 안 넘기면 위치가 십몇 미터 흔들릴 때
   * 반대편 구간으로 옮겨 붙어 남은 거리가 절반으로 튄다.
   */
  const progress = useRef(0);

  const path = useMemo(() => trip.route?.candidate.path ?? [], [trip.route]);

  /**
   * 화면이 보이는 동안만 잠들지 않게 한다.
   *
   * 도착 화면으로 넘어가도 이 화면은 스택 아래에 그대로 살아 있어서, unmount에만
   * 걸어 두면 한 줄을 적는 3분 내내 화면이 안 꺼지고 고정밀 GPS도 계속 돈다.
   * 그래서 사라질 때(blur) 놓고, 다시 보일 때(focus) 잡는다.
   */
  const [focused, setFocused] = useState(true);

  useEffect(() => {
    const onFocus = navigation.addListener('focus', () => {
      setFocused(true);
      // 도착 화면에서 뒤로 나오면 이 화면이 다시 보인다 — 스택 아래에 살아 있어서
      // 컴포넌트가 다시 만들어지지 않는다. 넘어가는 중 표시를 풀지 않으면
      // '이미 도착했어요'가 영영 먹통이 되어 걷는 화면에 갇힌다.
      navigating.current = false;
      // 위치 표본은 이어 붙이지 않는다. 화면이 가려진 동안 GPS가 꺼져 있었으므로
      // 다음 측정과의 간격이 몇 분씩 벌어져, 그대로 speed를 내면 거의 0이 된다.
      previous.current = null;
    });
    const onBlur = navigation.addListener('blur', () => setFocused(false));
    return () => {
      onFocus();
      onBlur();
    };
  }, [navigation]);

  useEffect(() => {
    if (!focused) {
      return;
    }
    setScreenAwakeMode({ enabled: true }).catch(() => {});
    return () => {
      setScreenAwakeMode({ enabled: false }).catch(() => {});
    };
  }, [focused]);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now() + offset), 1000);
    return () => clearInterval(timer);
  }, [offset]);

  useEffect(() => {
    // 화면이 가려져 있으면 위치를 받을 이유가 없다. 3분 동안 고정밀 GPS를
    // 켜 둔 채로 두면 배터리만 먹고, 안 보이는 화면을 몇 초마다 다시 그린다.
    if (path.length === 0 || !focused) {
      return;
    }

    const stop = startUpdateLocation({
      // 도착을 40m로 재고 5m 간격 표본으로 속도를 낸다. Balanced는 SDK 문서상
      // 오차가 수백 미터라 그 판정이 통째로 흔들린다 — 걷는 동안에는 High를 쓴다.
      options: { accuracy: Accuracy.High, timeInterval: 3000, distanceInterval: 5 },
      onEvent: (location) => {
        const at: LatLng = {
          lat: location.coords.latitude,
          lng: location.coords.longitude,
        };
        // 기기 시각보다 측정 시각이 정확하다
        const ms = location.timestamp;

        // 직전 측정과의 거리는 속도에도 쓰고, 진행이 껑충 뛰는 것도 막는다.
        const movedM =
          previous.current != null ? distanceM(previous.current.at, at) : null;

        if (previous.current != null && movedM != null) {
          samples.current.push({
            distanceFromPrevM: movedM,
            elapsedSec: (ms - previous.current.ms) / 1000,
          });
          setSpeedMps(estimateSpeedMps(samples.current));
        }
        previous.current = { at, ms };

        setLocationLost(false);
        const walked = walkProgress(path, at, {
          since: progress.current,
          // 길이 굽어 있으므로 직선 거리보다 조금 더 갔을 수 있다. 여유를 둔다.
          // 첫 측정은 비교할 앞이 없어 제한하지 않는다.
          ...(movedM != null ? { maxAdvanceM: movedM * 1.5 + 20 } : {}),
        });
        progress.current = Math.max(progress.current, walked.alongRatio);
        setRemainingM(walked.remainingM);
      },
      // 조용히 삼키면 잘 걷는 사람에게 서두르라고 재촉하게 된다. 모르면 모른다고 한다.
      onError: () => setLocationLost(true),
    });

    return stop;
  }, [path, focused]);

  const goToArrival = useCallback(() => {
    if (navigating.current) {
      return;
    }
    navigating.current = true;

    // 기록에는 계획한 거리가 아니라 실제로 걸은 만큼을 남긴다.
    // 중간에 '이미 도착했어요'를 눌렀다면 나머지는 걷지 않은 길이다.
    // 위치를 한 번도 못 잡았다면 알 길이 없으니 null로 두고, 그때는 계획한 거리를 쓴다.
    const total = trip.route?.candidate.distanceM;
    const walked =
      total != null && remainingM != null ? Math.max(0, total - remainingM) : null;
    update({ walkedDistanceM: walked });

    navigation.navigate('/arrive');
  }, [navigation, update, trip.route, remainingM]);

  // 도착하면 바로 3분 화면으로. 자동은 딱 한 번이다.
  useEffect(() => {
    if (autoArrived.current || remainingM == null || remainingM > ARRIVED_RADIUS_M) {
      return;
    }
    autoArrived.current = true;
    goToArrival();
  }, [remainingM, goToArrival]);

  /**
   * 무엇까지 세는가.
   *
   * 보통은 약속 3분 전이다 — 길이 그 시각에 닿도록 골라졌으니 그게 곧 도착 시각이다.
   * 다만 약속보다 눈에 띄게 일찍 닿게 되는 계획이면(`arrivesEarly`) 둘이 갈라진다.
   * 87분이 남았는데 44분짜리 길을 걷는다면 약속 3분 전까지 세는 건 43분을 부풀리는 것이고,
   * 화면은 도착하고 나서도 "43분 남았다"고 말하게 된다. 그럴 땐 실제로 닿을 시각을 센다.
   */
  const plannedArrivalMs =
    trip.route != null ? arrivalAt(startedAtMs, trip.route.candidate.durationSec) : null;
  const promiseMs =
    trip.arriveAtMs != null ? trip.arriveAtMs - ARRIVE_EARLY_SEC * 1000 : null;
  const targetMs = trip.arrivesEarly ? plannedArrivalMs : (promiseMs ?? plannedArrivalMs);

  const remainingSec = targetMs != null ? Math.max(0, (targetMs - nowMs) / 1000) : 0;

  const advice = paceAdvice({
    remainingM: remainingM ?? trip.route?.candidate.distanceM ?? 0,
    remainingSec,
    currentSpeedMps: speedMps,
  });

  // 위치를 못 잡고 있으면 페이스는 추측일 뿐이다. 추측으로 재촉하지 않는다.
  // 첫 측정을 기다리는 정상 구간은 지나 보내고, 그 뒤로도 없으면 그렇다고 말한다.
  const blind =
    locationLost || (remainingM == null && nowMs - startedAtMs > LOCATION_GRACE_MS);

  return (
    <View style={[styles.screen, { paddingTop: screen.top, paddingBottom: screen.bottom }]}>
      {/* 위아래 여백으로 가운데를 잡고, 맨 아래에만 도망갈 문을 둔다. */}
      <View style={styles.spacer} />

      <View style={styles.top}>
        <Text style={styles.remainingLabel}>도착까지</Text>
        <Text style={styles.remaining}>{formatDuration(remainingSec)}</Text>
        {/*
          자리를 늘 잡아 둔다. 첫 측정이 들어올 때 이 줄이 생기면 위의 큰 숫자가
          아래로 밀리는데, 걷는 내내 위치는 끊겼다 붙었다 한다 —
          가장 조용해야 할 화면이 그때마다 들썩이면 안 된다.
        */}
        <Text style={styles.distance}>
          {remainingM != null ? `${Math.round(remainingM)}m 남았어요` : ' '}
        </Text>
      </View>

      {blind ? (
        <View style={[styles.advice, adviceTone.keep]}>
          <Text style={styles.adviceText}>지금 위치가 잡히지 않아요</Text>
          <Text style={styles.adviceSub}>시간은 계속 재고 있을게요.</Text>
        </View>
      ) : (
        <View style={[styles.advice, adviceTone[advice.action]]}>
          <Text style={styles.adviceText}>{advice.message}</Text>
        </View>
      )}

      {/*
        지킬 수 있는 말만 한다. 일찍 닿게 되는 계획은 3분 전에 맞추는 게 아니라
        그냥 넉넉히 걷는 것이므로, 그때는 그렇게 말한다.
      */}
      <Text style={styles.footnote}>
        {trip.destinationName !== '' ? `${trip.destinationName}까지 ` : ''}
        {trip.arrivesEarly ? '넉넉히 걷고 있어요.' : '3분 전에 도착하도록 맞추고 있어요.'}
      </Text>

      <View style={styles.spacer} />

      {/*
        도착 판정은 GPS 하나에 걸려 있다. 실내로 들어갔거나 위치가 흔들리면
        영영 안 잡히고, 그러면 3분 화면도 기록도 없다 — 직접 열 문을 하나 둔다.
      */}
      <Pressable
        style={({ pressed }) => [styles.manual, pressed && styles.pressed]}
        onPress={goToArrival}
      >
        <Text style={styles.manualText}>이미 도착했어요</Text>
      </Pressable>
    </View>
  );
}

/**
 * 페이스 안내의 바탕색.
 *
 * 걷는 중에 흘깃 보는 화면이라 여기서만 색을 쓴다. 다만 경고처럼 보이면 안 된다 —
 * 늦는 게 사고는 아니니까. 채도를 낮춰 종이 위에 색을 얹은 정도로만 둔다.
 */
const adviceTone = StyleSheet.create({
  // 네 상태가 서로 구별되면서도 경고처럼 보이지 않게. 바탕(#FAF9F6)보다는 또렷해야
  // 카드로 읽히므로 keep도 흰색에 테두리를 준다.
  slower: { backgroundColor: '#E9EEF6' },
  keep: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  faster: { backgroundColor: '#F6EEDD' },
  hurry: { backgroundColor: '#F4E0D9' },
});

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
  },
  spacer: { flex: 1 },
  top: { alignItems: 'center', marginBottom: spacing.xl },
  remainingLabel: { ...type.caption, color: colors.inkSoft },
  // 굵기를 빼고 크기로만. 굵은 숫자는 재촉처럼 읽힌다.
  remaining: { ...type.numeral, color: colors.ink },
  // 걸으면서 흘깃 보는 화면이다. 여기서는 작게 만들지 않는다.
  distance: { ...type.body, color: colors.inkSoft, marginTop: spacing.xs },
  // 안내가 한 줄이든 두 줄이든 높이가 같아야 위의 큰 숫자가 움직이지 않는다.
  advice: {
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 96,
  },
  adviceText: { ...type.title, color: colors.ink },
  adviceSub: { ...type.caption, color: colors.inkSoft, marginTop: spacing.xs },
  footnote: {
    ...type.caption,
    color: colors.inkFaint,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  // 도망갈 문. 재촉하지 않도록 가장 옅게, 그러나 눌린다는 건 보이게.
  manual: { paddingVertical: spacing.md, alignItems: 'center' },
  manualText: { ...type.body, color: colors.inkSoft, textDecorationLine: 'underline' },
  pressed: { opacity: 0.6 },
});

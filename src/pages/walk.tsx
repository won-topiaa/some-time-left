import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createRoute, useNavigation } from '@granite-js/react-native';
import { Accuracy, setScreenAwakeMode, startUpdateLocation } from '@apps-in-toss/framework';
import { distanceM, remainingDistanceM } from '../domain/geo';
import { DEFAULT_WALK_SPEED_MPS, estimateSpeedMps, paceAdvice } from '../domain/pace';
import { ARRIVE_EARLY_SEC, formatDuration } from '../domain/time';
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
  const { trip } = useTrip();
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
  // 도착 화면으로는 한 번만 넘어간다. 40m 안쪽 측정이 연달아 들어오면
  // navigate가 여러 번 불리고, 수동 버튼과도 겹칠 수 있다.
  const arrived = useRef(false);

  const path = useMemo(() => trip.route?.candidate.path ?? [], [trip.route]);

  // 걷는 내내 화면이 꺼지면 페이스 코칭이 무의미하다.
  useEffect(() => {
    setScreenAwakeMode({ enabled: true }).catch(() => {});
    return () => {
      setScreenAwakeMode({ enabled: false }).catch(() => {});
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now() + offset), 1000);
    return () => clearInterval(timer);
  }, [offset]);

  useEffect(() => {
    if (path.length === 0) {
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

        if (previous.current != null) {
          samples.current.push({
            distanceFromPrevM: distanceM(previous.current.at, at),
            elapsedSec: (ms - previous.current.ms) / 1000,
          });
          setSpeedMps(estimateSpeedMps(samples.current));
        }
        previous.current = { at, ms };

        setLocationLost(false);
        setRemainingM(remainingDistanceM(path, at));
      },
      // 조용히 삼키면 잘 걷는 사람에게 서두르라고 재촉하게 된다. 모르면 모른다고 한다.
      onError: () => setLocationLost(true),
    });

    return stop;
  }, [path]);

  const goToArrival = useCallback(() => {
    if (arrived.current) {
      return;
    }
    arrived.current = true;
    navigation.navigate('/arrive');
  }, [navigation]);

  // 도착하면 바로 3분 화면으로.
  useEffect(() => {
    if (remainingM != null && remainingM <= ARRIVED_RADIUS_M) {
      goToArrival();
    }
  }, [remainingM, goToArrival]);

  const targetMs =
    trip.arriveAtMs != null ? trip.arriveAtMs - ARRIVE_EARLY_SEC * 1000 : null;
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
        {remainingM != null && (
          <Text style={styles.distance}>{Math.round(remainingM)}m 남았어요</Text>
        )}
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

      <Text style={styles.footnote}>
        {trip.destinationName !== '' ? `${trip.destinationName}까지 ` : ''}
        3분 전에 도착하도록 맞추고 있어요.
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
  advice: {
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
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

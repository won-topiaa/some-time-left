import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { createRoute, useNavigation } from '@granite-js/react-native';
import { Accuracy, setScreenAwakeMode, startUpdateLocation } from '@apps-in-toss/framework';
import { distanceM, remainingDistanceM } from '../domain/geo';
import { DEFAULT_WALK_SPEED_MPS, estimateSpeedMps, paceAdvice } from '../domain/pace';
import { ARRIVE_EARLY_SEC, formatDuration } from '../domain/time';
import { colors, radius, spacing, type } from '../ui/theme';
import { useTrip } from '../state/TripContext';
import type { LatLng } from '../domain/types';

export const Route = createRoute('/walk', {
  component: Walk,
});

/** 도착 판정 반경 (m). */
const ARRIVED_RADIUS_M = 40;

/**
 * 걷는 중 화면.
 *
 * 경로를 다시 그리는 대신 속도를 미세 조정하게 한다.
 * 사람에게는 "다른 길로 가세요"보다 "조금 천천히 걸어도 돼요"가 훨씬 자연스럽다.
 */
function Walk() {
  const navigation = useNavigation();
  const { trip } = useTrip();
  const [remainingM, setRemainingM] = useState<number | null>(null);
  const [speedMps, setSpeedMps] = useState(DEFAULT_WALK_SPEED_MPS);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const samples = useRef<{ distanceFromPrevM: number; elapsedSec: number }[]>([]);
  const previous = useRef<{ at: LatLng; ms: number } | null>(null);

  const path = trip.route?.candidate.path ?? [];

  // 걷는 내내 화면이 꺼지면 페이스 코칭이 무의미하다.
  useEffect(() => {
    setScreenAwakeMode({ enabled: true }).catch(() => {});
    return () => {
      setScreenAwakeMode({ enabled: false }).catch(() => {});
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (path.length === 0) {
      return;
    }

    const stop = startUpdateLocation({
      options: { accuracy: Accuracy.Balanced, timeInterval: 3000, distanceInterval: 5 },
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

        setRemainingM(remainingDistanceM(path, at));
      },
      onError: () => {},
    });

    return stop;
  }, [path]);

  // 도착하면 바로 3분 화면으로.
  useEffect(() => {
    if (remainingM != null && remainingM <= ARRIVED_RADIUS_M) {
      navigation.navigate('/arrive');
    }
  }, [remainingM, navigation]);

  const targetMs =
    trip.arriveAtMs != null ? trip.arriveAtMs - ARRIVE_EARLY_SEC * 1000 : null;
  const remainingSec = targetMs != null ? Math.max(0, (targetMs - nowMs) / 1000) : 0;

  const advice = paceAdvice({
    remainingM: remainingM ?? trip.route?.candidate.distanceM ?? 0,
    remainingSec,
    currentSpeedMps: speedMps,
  });

  return (
    <View style={styles.screen}>
      <View style={styles.top}>
        <Text style={styles.remainingLabel}>도착까지</Text>
        <Text style={styles.remaining}>{formatDuration(remainingSec)}</Text>
        {remainingM != null && (
          <Text style={styles.distance}>{Math.round(remainingM)}m 남았어요</Text>
        )}
      </View>

      <View style={[styles.advice, adviceTone[advice.action]]}>
        <Text style={styles.adviceText}>{advice.message}</Text>
      </View>

      <Text style={styles.footnote}>
        {trip.destinationName !== '' ? `${trip.destinationName}까지 ` : ''}
        3분 전에 도착하도록 맞추고 있어요.
      </Text>
    </View>
  );
}

const adviceTone = StyleSheet.create({
  slower: { backgroundColor: colors.accentSoft },
  keep: { backgroundColor: colors.surface },
  faster: { backgroundColor: '#FBF0DC' },
  hurry: { backgroundColor: '#F8E0DC' },
});

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  top: { alignItems: 'center', marginBottom: spacing.xl },
  remainingLabel: { ...type.caption, color: colors.inkSoft },
  remaining: { fontSize: 56, lineHeight: 66, fontWeight: '700', color: colors.ink },
  distance: { ...type.body, color: colors.inkFaint, marginTop: spacing.xs },
  advice: {
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  adviceText: { ...type.title, color: colors.ink },
  footnote: {
    ...type.caption,
    color: colors.inkFaint,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});

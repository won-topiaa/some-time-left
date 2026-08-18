import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { createRoute, useNavigation } from '@granite-js/react-native';
import { alongRouteHint, planHeadline, routeReason } from '../domain/copy';
import { fetchPlaceAlongRoute, type AlongRoutePlace } from '../data/tmap/along-route';
import { formatClock, formatDuration } from '../domain/time';
import { colors, radius, spacing, type } from '../ui/theme';
import { RoutePreview } from '../ui/RoutePreview';
import { useTrip } from '../state/TripContext';
import { useRouteSuggestion } from '../state/useRouteSuggestion';

export const Route = createRoute('/route', {
  component: RouteScreen,
});

/**
 * 자동 추천의 신뢰는 정확도가 아니라 설명에서 나온다.
 * 그래서 이 화면의 주인공은 지도가 아니라 "왜 이 길인지" 한 줄이다.
 */
function RouteScreen() {
  const navigation = useNavigation();
  const { trip, update } = useTrip();
  const { loading, error, plan, route, hasAlternative, showAnother } = useRouteSuggestion({
    destination: trip.destination,
    arriveAtMs: trip.arriveAtMs,
    mood: trip.mood,
  });

  // 가는 길에 스치는 가게 한 곳. 목적이 아니라 곁에 있다고 알려주는 정도.
  // 경로가 바뀌면(다른 길) 다시 찾고, 없으면 없는 채로 둔다.
  const [nearbyPlace, setNearbyPlace] = useState<AlongRoutePlace | null>(null);
  const routeId = route?.candidate.id;
  const routePath = route?.candidate.path;

  useEffect(() => {
    setNearbyPlace(null);
    if (routePath == null || routePath.length < 2) {
      return;
    }
    let cancelled = false;
    fetchPlaceAlongRoute(routePath).then((place) => {
      if (!cancelled) {
        setNearbyPlace(place);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [routeId]);

  if (loading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.searching}>길을 찾고 있어요</Text>
      </View>
    );
  }

  if (error != null || plan == null) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.headline}>{error ?? '길을 찾지 못했어요.'}</Text>
      </View>
    );
  }

  // 최단으로도 늦는 경우. 빈 화면 대신 정직하게 말한다.
  if (plan.kind === 'too-late') {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.headline}>{planHeadline(plan)}</Text>
        <Text style={styles.sub}>지금 나서는 게 최선이에요.</Text>
      </View>
    );
  }

  const startWalking = () => {
    update({ plan, route, startedAtMs: Date.now() });
    navigation.navigate('/walk');
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.headline}>{planHeadline(plan)}</Text>

      {route != null && (
        <>
          <View style={styles.card}>
            <RoutePreview path={route.candidate.path} />

            <View style={styles.meta}>
              <Text style={styles.duration}>
                {formatDuration(route.candidate.durationSec)}
              </Text>
              <Text style={styles.metaSub}>
                {(route.candidate.distanceM / 1000).toFixed(1)}km
                {trip.arriveAtMs != null && ` · ${formatClock(trip.arriveAtMs)} 약속`}
              </Text>
            </View>

            {trip.mood != null && (
              <Text style={styles.reason}>
                {routeReason(trip.mood, route.dominantFeature)}
              </Text>
            )}

            {nearbyPlace != null && (
              <Text style={styles.nearby}>{alongRouteHint(nearbyPlace.name)}</Text>
            )}
          </View>

          {/* 조건 버튼은 입구가 아니라 출구에 둔다. 자동 추천이 틀렸을 때의 도망갈 곳. */}
          {hasAlternative && (
            <Pressable style={styles.ghost} onPress={showAnother}>
              <Text style={styles.ghostText}>다른 길로 보여주세요</Text>
            </Pressable>
          )}
        </>
      )}

      <View style={styles.spacer} />

      <Pressable style={styles.cta} onPress={startWalking}>
        <Text style={styles.ctaText}>
          {plan.kind === 'straight' ? '곧장 갈게요' : '이 길로 갈게요'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  center: { alignItems: 'center', justifyContent: 'center' },
  searching: { ...type.body, color: colors.inkSoft, marginTop: spacing.md },
  headline: { ...type.display, color: colors.ink, marginTop: spacing.xl },
  sub: { ...type.body, color: colors.inkSoft, marginTop: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  meta: { marginTop: spacing.md },
  duration: { ...type.display, color: colors.ink },
  metaSub: { ...type.caption, color: colors.inkFaint, marginTop: spacing.xs },
  reason: {
    ...type.body,
    color: colors.accent,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  nearby: { ...type.caption, color: colors.inkFaint, marginTop: spacing.sm },
  ghost: { paddingVertical: spacing.md, alignItems: 'center' },
  ghostText: { ...type.body, color: colors.inkSoft, textDecorationLine: 'underline' },
  spacer: { flex: 1 },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
  },
  ctaText: { ...type.title, color: colors.surface },
});

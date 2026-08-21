import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { createRoute, useNavigation } from '@granite-js/react-native';
import { alongRouteHint, planHeadline, routeReason } from '../domain/copy';
import { fetchPlaceAlongRoute, type AlongRoutePlace } from '../data/tmap/along-route';
import { arrivalAt, formatClock, formatDuration } from '../domain/time';
import { colors, radius, spacing, type } from '../ui/theme';
import { useScreenInsets } from '../ui/screenInsets';
import { moodTint } from '../ui/moodTint';
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
  const screen = useScreenInsets();
  const {
    loading,
    error,
    plan,
    route,
    hasAlternative,
    showAnother,
    retry,
    stretched,
    clockOffsetMs,
    onTime,
  } = useRouteSuggestion({
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
      <View style={[styles.screen, styles.center, { paddingTop: screen.top, paddingBottom: screen.bottom }]}>
        <ActivityIndicator color={colors.inkFaint} />
        <Text style={styles.searching}>길을 찾고 있어요</Text>
      </View>
    );
  }

  // 실패가 막다른 길이 되면 안 된다. 약속을 앞두고 네트워크가 한 번 흔들린 것뿐인데
  // 앱을 껐다 켜게 만들 이유는 없다 — 한 번 더 눌러볼 자리를 준다.
  if (error != null || plan == null) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: screen.top, paddingBottom: screen.bottom }]}>
        <Text style={styles.errorHeadline}>{error ?? '길을 찾지 못했어요.'}</Text>
        <Pressable
          style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}
          onPress={retry}
        >
          <Text style={styles.ghostText}>다시 찾아볼게요</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          onPress={() => navigation.navigate('/')}
        >
          <Text style={styles.backText}>처음으로</Text>
        </Pressable>
      </View>
    );
  }

  // 최단으로도 늦는 경우. 빈 화면 대신 정직하게 말한다.
  if (plan.kind === 'too-late') {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: screen.top, paddingBottom: screen.bottom }]}>
        <Text style={styles.headline}>{planHeadline(plan)}</Text>
        <Text style={styles.sub}>지금 나서는 게 최선이에요.</Text>
      </View>
    );
  }

  const startWalking = () => {
    // 시계 차이를 함께 실어 보낸다. 걷는 화면·도착 화면이 계획과 같은 시계로 세야
    // 도착 시각이 화면마다 다른 숫자가 되지 않는다.
    // 걸은 거리는 아직 0이 아니라 '모름'이다 — 걷는 화면이 채운다.
    update({
      route,
      clockOffsetMs,
      walkedDistanceM: null,
      // 상한에서 잘렸거나 아예 못 늘렸으면 목표 시각 도착을 약속할 수 없다.
      // 걷는 화면이 알아야 같은 말을 하지 않는다.
      // 고른 길이 문턱을 못 넘었으면(onTime === false) 걷는 화면도 목표 시각을
      // 약속하면 안 된다. 계획만 보고 정하면 그 화면만 혼자 옛말을 하게 된다.
      arrivesEarly: plan.kind === 'stretch' && (plan.capped || !stretched || !onTime),
    });
    navigation.navigate('/walk');
  };

  return (
    <View style={[styles.screen, { paddingTop: screen.top, paddingBottom: screen.bottom }]}>
      {/*
        작은 기기에서는 헤드라인·리본·시간·이유·가게 한 줄이 화면보다 길어진다.
        고정 높이로 두면 맨 아래 걷기 버튼이 화면 밖으로 밀려 아무것도 못 하게 되므로,
        위쪽은 스크롤로 흐르게 하고 버튼만 아래에 붙여 둔다.
      */}
      <ScrollView
        contentContainerStyle={styles.flow}
        showsVerticalScrollIndicator={false}
      >
        {/*
          늘리지 못했으면 늘렸다고 하지 않는다.
          경유지가 하나도 도로망에 안 붙는 날이 있는데(전부 물 위나 건물 안으로 떨어진다),
          그때는 최단 경로로 물러선다. 그 길에 "골라 온 길이에요"를 붙이면
          15분에서 두 시간까지 일찍 도착하는 길에 지키지 못할 약속을 얹는 셈이다.
        */}
        <Text style={styles.headline}>
          {plan.kind === 'stretch' && !stretched
            ? '오늘은 돌아갈 길을 못 찾았어요.'
            : plan.kind === 'stretch' && !onTime
              ? '딱 맞는 길이 없었어요.'
              : planHeadline(plan)}
        </Text>

        {plan.kind === 'stretch' && !stretched && (
          <Text style={styles.sub}>곧장 가는 길로 보여드릴게요.</Text>
        )}

        {/*
          늘리는 데는 성공했는데 어느 후보도 시간에 안 맞는 날이 있다.
          그때 "먼저 닿는 길이에요"를 그대로 두면 화면에 적힌 도착 시각과
          바로 어긋난다 — 아래 도착 시각이 그 거짓말을 즉시 들키게 만든다.
        */}
        {plan.kind === 'stretch' && stretched && !onTime && (
          <Text style={styles.sub}>가장 가까운 길로 보여드릴게요.</Text>
        )}

        {route != null && (
          <View style={styles.card}>
            {/* 길에 그날의 기분 색을 입힌다. 이 색 그대로 기록에 남는다. */}
            <RoutePreview
              path={route.candidate.path}
              tint={trip.mood != null ? moodTint(trip.mood) : colors.ink}
            />

            <View style={styles.meta}>
              <Text style={styles.duration}>
                {formatDuration(route.candidate.durationSec)}
              </Text>
              {/*
                도착 시각을 적는다.

                소요 시간만 보여주면 "몇 분 전"은 앱만 아는 약속이 된다. 다른 길을
                눌러 30분이 34분이 됐을 때, 사용자가 검산할 방법이 화면에 없으면
                이 앱이 무엇을 지키고 있는지도 보이지 않는다.
                기준 시계는 서버 시각이다 — 계획을 세운 시계와 같아야 두 숫자가 안 어긋난다.
              */}
              <Text style={styles.arrival}>
                {formatClock(
                  arrivalAt(Date.now() + clockOffsetMs, route.candidate.durationSec)
                )}{' '}
                도착
              </Text>
              <Text style={styles.metaSub}>
                {(route.candidate.distanceM / 1000).toFixed(1)}km
                {trip.arriveAtMs != null && ` · ${formatClock(trip.arriveAtMs)} 약속`}
              </Text>
            </View>

            {/*
              고르지 않은 길에는 고른 이유를 붙이지 않는다.
              여유가 없어 곧장 가는 계획(straight)은 후보가 하나뿐이라 이 문장이
              "골랐다"고 말하게 되는데, 바로 위 헤드라인은 "그냥 곧장 가요"라고 한다.
              둘이 어긋나면 이 앱이 신뢰를 얻는 유일한 문장이 흠집이 된다.
            */}
            {trip.mood != null && plan.kind === 'stretch' && (
              <Text style={styles.reason}>
                {routeReason(trip.mood, route.dominantFeature)}
              </Text>
            )}

            {nearbyPlace != null && (
              <Text style={styles.nearby}>{alongRouteHint(nearbyPlace.name)}</Text>
            )}
          </View>
        )}

        {/* 조건 버튼은 입구가 아니라 출구에 둔다. 자동 추천이 틀렸을 때의 도망갈 곳. */}
        {route != null && hasAlternative && (
          <Pressable
            style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}
            onPress={showAnother}
          >
            <Text style={styles.ghostText}>다른 길로 보여주세요</Text>
          </Pressable>
        )}
      </ScrollView>

      {/*
        길이 없으면 걷기 버튼도 없다. 좌표 없이 걷기 화면에 들어가면
        도착을 영영 못 잡고 기록도 남지 않는다 — 눌리는 죽은 버튼보다 없는 게 낫다.
      */}
      {route != null ? (
        <Pressable
          style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
          onPress={startWalking}
        >
          <Text style={styles.ctaText}>
            {plan.kind === 'straight' || !stretched ? '곧장 갈게요' : '이 길로 갈게요'}
          </Text>
        </Pressable>
      ) : (
        <Pressable
          style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}
          onPress={retry}
        >
          <Text style={styles.ghostText}>길을 다시 찾아볼게요</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  center: { alignItems: 'center', justifyContent: 'center' },
  searching: { ...type.body, color: colors.inkSoft, marginTop: spacing.md },
  headline: { ...type.display, color: colors.ink, marginTop: spacing.xl },
  // 실패 문구는 가운데 정렬 화면에 놓이므로 위 여백을 두지 않는다.
  errorHeadline: { ...type.title, color: colors.ink, textAlign: 'center' },
  sub: { ...type.body, color: colors.inkSoft, marginTop: spacing.sm },
  // 눌린 걸 알리는 유일한 수단. 색을 바꾸지 않고 옅어지기만 한다 —
  // 크롬에 색을 쓰지 않는다는 원칙을 누르는 순간에도 지킨다.
  pressed: { opacity: 0.6 },
  back: { paddingVertical: spacing.sm, alignItems: 'center' },
  backText: { ...type.caption, color: colors.inkFaint },
  // 면을 채우지 않는다. 배경 위에 그대로 두고 선과 여백으로만 나눈다.
  card: { marginTop: spacing.lg },
  meta: { marginTop: spacing.md },
  // 걷는 시간이 이 화면의 주인공. 굵기 대신 크기로 말한다.
  duration: { ...type.numeral, fontSize: 44, lineHeight: 52, color: colors.ink },
  /*
    도착 시각은 약속을 검산하는 줄이라 곁다리 수치보다 한 단계 앞에 둔다.
    그래도 주인공은 위의 큰 숫자이므로 크기를 키우지 않고 색만 진하게 한다.
  */
  arrival: { ...type.caption, color: colors.inkSoft, marginTop: spacing.xs },
  metaSub: { ...type.caption, color: colors.inkFaint, marginTop: 2 },
  // 추천 이유는 이 앱의 생명줄이라 또렷하게 두되, 색이 아니라 자리로 강조한다.
  reason: {
    ...type.body,
    color: colors.ink,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  nearby: { ...type.caption, color: colors.inkFaint, marginTop: spacing.sm },
  // 자동 추천이 틀렸을 때의 도망갈 곳이다. 눌러진다는 게 보여야 한다.
  ghost: { paddingVertical: spacing.md, alignItems: 'center' },
  ghostText: { ...type.body, color: colors.inkSoft, textDecorationLine: 'underline' },
  // 위쪽은 흐르고, 버튼만 아래에 붙는다.
  flow: { flexGrow: 1 },
  cta: {
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
  },
  ctaText: { ...type.title, color: colors.surface },
});

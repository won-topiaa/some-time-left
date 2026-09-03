import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { createRoute, useNavigation } from '@granite-js/react-native';
import { alongRouteHint, planHeadline, routeReason } from '../domain/copy';
import { fetchPlaceAlongRoute, type AlongRoutePlace } from '../data/tmap/along-route';
import {
  arrivalAt,
  arriveEarlySecFor,
  departAt,
  formatClock,
  formatDuration,
  waitSec,
} from '../domain/time';
import { radius, spacing } from '../ui/theme';
import { type Palette, type TypeScale, useStyles, useTheme } from '../ui/useTheme';
import { useScreenInsets } from '../ui/screenInsets';
import { moodTint } from '../ui/moodTint';
import { RouteMap } from '../ui/RouteMap';
import { RouteSource } from '../ui/RouteSource';
import { useTrip } from '../state/TripContext';
import { useRouteSuggestion } from '../state/useRouteSuggestion';

/**
 * 이만큼은 기다려야 "몇 시에 나서면 돼요"를 말한다 (초).
 *
 * departAt은 1초만 남아도 시각을 준다. 후보는 목표보다 조금 아래로 흩어져
 * 있어서(aimSec) 몇십 초쯤 이른 길은 흔한데, 그때 "14:03에 나서면 딱 맞아요"라고
 * 하면 지금 나서는 길에 다음 분까지 서 있으라는 말이 된다. 시각과 남은 시간을
 * 같은 문턱으로 묶는다 — 한쪽만 걸면 시각만 덩그러니 남는다.
 */
const LEAVE_HINT_MIN_SEC = 60;

export const Route = createRoute('/route', {
  component: RouteScreen,
  // 토스 내비게이션 바의 뒤로가기와 겹치지 않게 라우터 기본 헤더는 끈다.
  screenOptions: { headerShown: false },
});

/**
 * 자동 추천의 신뢰는 정확도가 아니라 설명에서 나온다.
 * 그래서 이 화면의 주인공은 지도가 아니라 "왜 이 길인지" 한 줄이다.
 */
function RouteScreen() {
  const { colors, scheme } = useTheme();
  const styles = useStyles(createStyles);
  const navigation = useNavigation();
  const { trip, update } = useTrip();
  const screen = useScreenInsets();
  /**
   * 도착 시각 표시용 '지금'.
   *
   * 렌더 시점의 Date.now()를 그대로 쓰면 이 화면에서 고민하는 동안 숫자가
   * 멈춰 있다 — 6분을 고민하면 도착 시각이 6분 낙관이 되고, 걷기 화면이
   * 다시 잰 값과 어긋난다. 분 단위 표시라 30초면 충분히 자주다.
   */
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

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
    onTarget,
    fallback,
  } = useRouteSuggestion({
    destination: trip.destination,
    arriveAtMs: trip.arriveAtMs,
    mood: trip.mood,
    // 오늘의 "몇 분 전". 첫 화면이 읽은 날씨로 갈린다 — 비 오는 날은 7분.
    earlySec: arriveEarlySecFor(trip.weather),
  });
  /**
   * 계획이 실제로 겨눈 값. 나설 시각도 걷는 화면도 이 숫자 하나를 쓴다.
   *
   * 아직 계획이 없는 순간(로딩·오류)에만 날씨에서 다시 낸다. 계획이 있는데 날씨로
   * 다시 내면, 뒤늦게 온 날씨가 계획과 나설 시각을 2분 어긋나게 만들 수 있다.
   */
  const plannedEarlySec =
    plan != null && plan.kind !== 'too-late' ? plan.earlySec : arriveEarlySecFor(trip.weather);

/**
   * 지금 나서면 너무 이른 날, 언제 나서면 되는지.
   *
   * 여유가 상한을 넘으면 앱은 최단의 2.2배까지만 길을 늘린다. 그래서 87분이
   * 남았는데 44분짜리 길을 주고 "넉넉히 걸어볼까요"라고 말하는 날이 생기는데,
   * 그건 대답이 아니라 회피다. 사용자가 정말 알고 싶은 건 몇 시에 나서면 되는지다.
   */
  const leaveAtMs =
    trip.arriveAtMs != null && route != null
      ? departAt(trip.arriveAtMs, route.candidate.durationSec, nowMs + clockOffsetMs, plannedEarlySec)
      : null;
  const waitingSec = waitSec(leaveAtMs, nowMs + clockOffsetMs);

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
      // 길과 함께 고정한다. 걷는 화면이 날씨에서 다시 세면 뒤늦게 온 날씨에 목표가 움직인다.
      earlySec: plan.earlySec,
      clockOffsetMs,
      walkedDistanceM: null,
      walkedPath: null,
      /*
       * 지난 산책의 기록 장부를 여기서 지운다.
       *
       * `reset()`은 도착 화면의 버튼에서만 불린다. 그래서 도착 화면에서 버튼 대신
       * **뒤로 나가면** `recordSaved: true`와 그때의 `recordId`가 다음 이동까지
       * 그대로 따라왔다. 그 상태로 두 번째 산책을 마치면 도착 화면이 "이미 남겼다"고
       * 판단해 새 기록을 만들지 않고 **첫 기록에 메모만 얹는다** — 둘째 날 걸은
       * 거리와 좌표가 통째로 사라진다. 누적 거리가 이 앱에서 유일하게 쌓이는 것이라
       * 조용히 줄어드는 것이 특히 나쁘다.
       *
       * 걷기 시작이 곧 새 산책의 시작이므로, 그 장부는 여기서 백지가 된다.
       */
      recordSaved: false,
      recordId: null,
      // 상한에서 잘렸거나, 아예 못 늘렸거나, 늘린 길이 목표에 못 미쳤으면(onTarget
      // === false) 목표 시각 도착을 약속할 수 없다. 걷는 화면이 알아야 같은 말을
      // 하지 않는다 — 계획만 보고 정하면 그 화면만 혼자 옛말을 하게 된다.
      arrivesEarly: plan.kind === 'stretch' && (plan.capped || !stretched || !onTarget),
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
            : /*
                상한에서 잘린 날은 애초에 "넉넉히 걸어볼까요"라 목표에 맞을 수가 없다.
                그 밖의 날에 목표에 못 미치면 — 후보가 전부 늦어 최단으로 물러섰거나,
                늘린 길이 죄다 이르거나 — 맞췄다고 하지 않는다.
              */
              plan.kind === 'stretch' && !plan.capped && !onTarget
              ? '딱 맞는 길이 없었어요.'
              : planHeadline(plan)}
        </Text>

        {plan.kind === 'stretch' && !stretched && (
          <Text style={styles.sub}>곧장 가는 길로 보여드릴게요.</Text>
        )}

        {/*
          나설 시각.

          이 앱이 "몇 분 전에 도착하는 길"을 약속하는데, 여유가 넘치는 날에는
          그 약속을 지킬 방법이 길이 아니라 **출발 시각**이다. 여기까지 말해야
          약속이 끝난다 — 시각과 남은 시간을 함께 준다. 시각만 주면 지금과의
          거리를 사람이 매번 빼야 하고, 그 뺄셈이 이 앱이 대신 하기로 한 일이다.
        */}
        {leaveAtMs != null && waitingSec >= LEAVE_HINT_MIN_SEC && (
          <Text style={styles.leave}>
            {formatClock(leaveAtMs)}에 나서면 딱 맞아요 · {formatDuration(waitingSec)} 뒤
          </Text>
        )}

        {/*
          늘리는 데는 성공했는데 어느 후보도 시간에 안 맞는 날이 있다.
          그때 "먼저 닿는 길이에요"를 그대로 두면 화면에 적힌 도착 시각과
          바로 어긋난다 — 아래 도착 시각이 그 거짓말을 즉시 들키게 만든다.
        */}
        {plan.kind === 'stretch' && stretched && !plan.capped && !onTarget && (
          <Text style={styles.sub}>가장 가까운 길로 보여드릴게요.</Text>
        )}

        {route != null && (
          <View style={styles.card}>
            {/*
              길에 그날의 기분 색을 입힌다. 이 색 그대로 기록에 남는다.

              여기도 실제 지도를 깐다. "이 길로 갈까"를 정하는 자리인데 모양만
              보여주면 어디를 지나는지 알 수 없어서, 이유 한 줄만으로 결정하게 된다.
              지도는 옅은 회색뿐이라 아래 이유 한 줄에서 눈을 뺏지 않는다.
            */}
            <RouteMap
              path={route.candidate.path}
              height={200}
              tint={trip.mood != null ? moodTint(trip.mood, scheme) : colors.ink}
            />

            <RouteSource routeId={route.candidate.id} />

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
                  arrivalAt(nowMs + clockOffsetMs, route.candidate.durationSec)
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

              `fallback`도 같다. 그건 내놓을 게 없어 최단 경로로 물러선 자리인데,
              최단 경로는 환경 데이터를 부르지 않고 만든 것이라 성질 값이 재본 값이 아니다
              (novelty가 늘 1.0으로 나온다). 매일 걷는 출근길에 "아직 안 가보신 길이에요"라고
              말하게 되므로, 고르지 않은 길에는 이유도 붙이지 않는다.
            */}
            {/*
              두드러진 성질이 없으면 `dominantFeature`가 null이고, 그러면 이유를
              안 붙인다. 재보지 못해 중립값인 성질을 "이 길이 그렇다"고 말할 수는
              없다 — 횡단보도를 못 세는 공급자로 도는 날 "신호에 거의 안 걸리는
              길이에요"라고 하던 것이 그 경우다.
            */}
            {trip.mood != null &&
              plan.kind === 'stretch' &&
              !fallback &&
              route.dominantFeature != null && (
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
            {/* 최단으로 물러선 날도 곧장 가는 길이다. 그 길에 "이 길로"는 고른 척이 된다. */}
            {plan.kind === 'straight' || !stretched || fallback ? '곧장 갈게요' : '이 길로 갈게요'}
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

const createStyles = (colors: Palette, type: TypeScale) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
    center: { alignItems: 'center', justifyContent: 'center' },
    searching: { ...type.body, color: colors.inkSoft, marginTop: spacing.md },
    headline: { ...type.display, color: colors.ink, marginTop: spacing.xl },
    // 실패 문구는 가운데 정렬 화면에 놓이므로 위 여백을 두지 않는다.
    errorHeadline: { ...type.title, color: colors.ink, textAlign: 'center' },
    sub: { ...type.body, color: colors.inkSoft, marginTop: spacing.sm },
    /*
      나설 시각은 이 화면에서 유일하게 **행동을 바꾸는** 문장이라 물러서면 안 된다.
      크기는 본문 그대로 두고 강조색으로만 구별한다 — 크게 만들면 헤드라인과
      주인공을 다투게 된다.
    */
    leave: {
      ...type.body,
      color: colors.accent,
      marginTop: spacing.sm,
      fontWeight: '600',
    },
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

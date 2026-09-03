import { useCallback, useEffect, useState } from 'react';
import { Accuracy, getCurrentLocation, getServerTime } from '@apps-in-toss/framework';
import { type RouteProvider } from '../data/route-provider';
import { TmapRouteProvider } from '../data/tmap-route-provider';
import { OsrmRouteProvider } from '../data/osrm-route-provider';
import { isWalkablePath } from '../domain/route-sanity';
import { isTmapConfigured } from '../config';
import { RECENT_WINDOW, loadRecords } from '../data/records';
import { isShadeWorthy } from '../domain/shade';
import { weightsFor } from '../domain/mood';
import {
  firstRoute,
  isFallbackRoute,
  landsOnTarget,
  nextRoute,
  rankRoutes,
} from '../domain/route-plan';
import { planWalk, type WalkPlan } from '../domain/time';
import type { LatLng, MoodId, ScoredRoute } from '../domain/types';

/**
 * 마지막 실패를 사람이 읽을 한 줄로.
 *
 * 기다리면 풀릴 일과 그렇지 않은 일을 나눈다. 도로가 없는 곳을 찍은 사람에게
 * "잠시 뒤에 다시 해볼까요?"라고 하면, 눌러도 같은 화면이 돌아오는 막다른 길이
 * 된다 — 이 앱에서 재시도 버튼은 정말 다시 해볼 만할 때만 뜻이 있다.
 */
export function routeFailureLine(failure: unknown): string {
  const message = failure instanceof Error ? failure.message : '';

  // 도로망이 그 근처를 아예 모른다. 다시 눌러도 같은 답이 온다.
  if (message.includes('걸을 수 있는 길이 없어요')) {
    return '그 근처에는 걸을 수 있는 길이 없어요.\n장소를 다시 골라볼까요?';
  }
  // 공급자가 길이라고 보기 어려운 좌표를 보냈다. 이것도 다시 부른다고 안 바뀐다.
  if (message.includes('걸을 수 있는 모양이 아니에요')) {
    return '길을 제대로 받지 못했어요.\n장소를 다시 골라볼까요?';
  }
  // 나머지는 대개 네트워크다. 그때는 정말 다시 해볼 만하다.
  return '길을 찾지 못했어요. 잠시 뒤에 다시 해볼까요?';
}

/**
 * 시도할 공급자들, 좋은 순서대로.
 *
 * **전부 실제 도로망이다.** 예전엔 키가 없으면 좌표를 지어내는 공급자로 떨어졌고,
 * 그래서 산을 가로지르는 삼각형이 실기기에 떴다. 키가 없다는 건 조금 못한 진짜를
 * 쓴다는 뜻이지 거짓말을 해도 된다는 뜻이 아니다.
 *
 * TMAP은 횡단보도·계단까지 세어 주므로 성질이 더 잘 재진다. OSRM은 그런 건
 * 모르지만(모르는 건 중립값이 된다) 좌표는 똑같이 진짜다. 키가 있으면 앞을 쓰고,
 * 없거나 죽었으면 뒤로 넘어간다. 둘 다 안 되면 사실대로 말한다.
 */
function providerChain(): Array<() => RouteProvider> {
  const osrm = () => new OsrmRouteProvider();
  return isTmapConfigured() ? [() => new TmapRouteProvider(), osrm] : [osrm];
}

export interface Suggestion {
  loading: boolean;
  error: string | null;
  plan: WalkPlan | null;
  route: ScoredRoute | null;
  /** 아직 안 보여준, **약속을 지키는** 다른 길이 남아 있는가 */
  hasAlternative: boolean;
  showAnother: () => void;
  /** 다시 찾아본다. 네트워크가 한 번 흔들린 게 막다른 길이 될 이유는 없다. */
  retry: () => void;
  /**
   * 계획대로 길을 늘렸는가.
   *
   * 경유지가 하나도 안 붙어 최단 경로로 물러섰으면 false다. 그때는 자투리 시간을
   * 걷기로 채우지 못한 것이므로 화면이 늘렸다고 말하면 안 된다.
   */
  stretched: boolean;
  /**
   * 서버 시각 − 기기 시각 (ms). 걷는 화면·도착 화면이 같은 시계로 세도록 넘긴다.
   * 서버 시각을 못 받았으면 0.
   */
  clockOffsetMs: number;
  /**
   * 지금 보여주는 길이 **약속 앞 목표 언저리에** 닿는가 — 늦지도, 5분 넘게 이르지도 않은가.
   *
   * 늦는 길은 애초에 여기까지 오지 않는다(`nextRoute`가 거른다). 그러니 이 값이
   * 거짓이면 뜻은 하나다: 일찍 닿는다. 그때 화면은 "5분 전에 닿는 길이에요"라고
   * 말하면 안 되고, 걷는 화면도 목표 시각을 약속하면 안 된다.
   *
   * `stretched`와 다르다. 저건 길을 늘리는 데 성공했는지고, 이건 늘린 길이 목표에
   * 맞았는지다. 예전엔 `arrivesOnTime`(늦지 않는가)을 그대로 내보냈는데, 늦는 길은
   * 어차피 안 나오므로 늘 참이었다 — 최단으로 물러선 날에도 맞췄다고 말했다.
   */
  onTarget: boolean;
  /**
   * 내놓을 후보가 없어 최단 경로로 물러섰는가.
   *
   * 최단은 첫 화면을 빠르게 띄우려고 환경 데이터 없이 만들어서 성질 값이 재본 값이
   * 아니다(novelty가 늘 1.0). 그 길에 "아직 안 가보신 길이에요"를 붙이면 매일 걷는
   * 출근길에 그렇게 말하게 되므로, 화면은 이 값이 참이면 이유를 붙이지 않는다.
   */
  fallback: boolean;
}

export interface SuggestionInput {
  destination: LatLng | null;
  arriveAtMs: number | null;
  mood: MoodId | null;
  /** 약속 몇 초 전을 겨눌 것인가. 날씨가 정한다(`arriveEarlySecFor`). */
  earlySec: number;
}

/**
 * 기기 시계는 믿지 않는다. 분 단위를 약속하는 앱에서 시계가 몇 분 틀어져 있으면
 * 그 자체로 제품이 거짓말을 하게 된다.
 *
 * 계획만 서버 시각으로 세우고 이후 화면이 기기 시계로 세면 어긋남이 그대로 돌아오므로,
 * 시각과 함께 **차이**를 돌려준다. 이후 화면은 `Date.now() + offset`으로 센다.
 */
async function now(): Promise<{ nowMs: number; offsetMs: number }> {
  const serverTime = await getServerTime().catch(() => undefined);
  if (serverTime == null) {
    return { nowMs: Date.now(), offsetMs: 0 };
  }
  return { nowMs: serverTime, offsetMs: serverTime - Date.now() };
}

export function useRouteSuggestion({
  destination,
  arriveAtMs,
  mood,
  earlySec,
}: SuggestionInput): Suggestion {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<WalkPlan | null>(null);
  const [ranked, setRanked] = useState<ScoredRoute[]>([]);
  /**
   * 최단 경로. 아무것도 제때 닿지 못할 때 마지막으로 내놓는 한 장.
   *
   * **순위에는 넣지 않는다.** `shortest()`는 첫 화면을 빠르게 띄우려고 환경 데이터를
   * 부르지 않아서, novelty가 재보지도 않고 1.0으로 나온다(`noveltyOf`는 기록이 없으면
   * 전부 새 길로 친다). 그대로 후보에 섞으면 기분 점수가 부풀어 진짜 후보를 밀어내고,
   * 매일 걷는 출근길에 "아직 안 가보신 길이에요"라고 말하게 된다.
   *
   * 그래서 따로 들고 있다가 정말 내놓을 게 없을 때만 쓴다. 늘리는 계획이 섰다는 건
   * 최단이 목표 안에 든다는 뜻이므로, 이 한 장은 언제나 제때 닿는다 —
   * 이게 "늦는 길은 안 내놓는다"의 바닥이다.
   */
  const [floor, setFloor] = useState<ScoredRoute | null>(null);
  const [shownIds, setShownIds] = useState<string[]>([]);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [stretched, setStretched] = useState(true);
  // 다시 찾기. 값이 바뀌면 아래 effect가 처음부터 다시 돈다.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      // 앱 안에서는 여기까지 빈 손으로 올 수 없지만, 스킴 링크는 어느 화면으로든
      // 바로 들어온다. 그때 로딩만 켜 두면 영영 도는 화면이 되므로 사실대로 말한다.
      if (destination == null || arriveAtMs == null || mood == null) {
        setLoading(false);
        setError('어디로, 몇 시에 가는지부터 알려주세요.');
        return;
      }

      setLoading(true);
      setError(null);
      setStretched(true);
      setFloor(null);

      // 위치 실패와 길 찾기 실패는 원인이 다르다. 한 덩어리로 잡아 "위치를 확인하지
      // 못했어요"라고 하면, 네트워크가 흔들렸을 뿐인데 권한을 의심하게 만든다.
      let origin: LatLng;
      let nowMs: number;
      try {
        const [position, clock] = await Promise.all([
          // 이 좌표가 최단 시간의 기준점이 되고, 거기서 도착 시각이 계산된다.
          // 수백 미터 어긋나면 그만큼(도보로 몇 분) 계획이 통째로 밀린다.
          getCurrentLocation({ accuracy: Accuracy.High }),
          now(),
        ]);
        origin = { lat: position.coords.latitude, lng: position.coords.longitude };
        nowMs = clock.nowMs;
        if (cancelled) return;
        setClockOffsetMs(clock.offsetMs);
      } catch {
        if (!cancelled) {
          setError('지금 위치를 확인하지 못했어요.');
          setLoading(false);
        }
        return;
      }

      try {
        /*
         * 공급자를 순서대로 시도한다.
         *
         * 최단 경로까지 같은 공급자로 받아야 한다 — 최단은 시간 예산 전체의
         * 기준점이라, 최단은 TMAP이 후보는 OSRM이 내면 두 속도 모형을 섞어 재는
         * 셈이 되고 "3분 전"이 그만큼 어긋난다. 그래서 하나를 고르면 끝까지 간다.
         */
        let provider: RouteProvider | null = null;
        let shortest: Awaited<ReturnType<RouteProvider['shortest']>> | null = null;
        let lastError: unknown = null;

        for (const make of providerChain()) {
          try {
            const attempted = make();
            shortest = await attempted.shortest(origin, destination);
            provider = attempted;
            break;
          } catch (failure) {
            lastError = failure;
          }
        }

        if (cancelled) return;
        // 전부 실패했다. 지어내지 않고 위 catch로 보낸다.
        if (provider == null || shortest == null) {
          throw lastError ?? new Error('길을 찾지 못했어요');
        }

        const walkPlan = planWalk({
          nowMs,
          arriveAtMs,
          shortestSec: shortest.durationSec,
          earlySec,
        });

        if (cancelled) return;
        setPlan(walkPlan);

        // 곧장 가거나 이미 늦은 경우엔 후보를 찾을 이유가 없다.
        if (walkPlan.kind !== 'stretch') {
          setFloor(null);
          setRanked(
            walkPlan.kind === 'straight'
              ? rankRoutes([shortest], {
                  targetSec: walkPlan.targetWalkSec,
                  weights: weightsFor(mood),
                })
              : []
          );
          return;
        }

        const records = await loadRecords().catch(() => []);
        const recent = records.slice(0, RECENT_WINDOW).map((r) => r.routeId);
        /*
         * 지어낸 좌표가 남아 있는 기록은 여기서 걸러 낸다.
         *
         * 좌표를 지어내던 시절의 기록이 기기에 그대로 있고, 그게 다시 입력으로
         * 돌아온다. 산을 가로지르는 직선이 '가 본 길'로 등록되면 그 근처를 지나는
         * **진짜** 길이 처음 걷는 길인데도 novelty를 깎인다 — 버그가 지나간 자국이
         * 앞으로의 추천을 계속 갉아먹는 셈이다.
         *
         * 기록 자체는 지우지 않는다. 그 산책은 실제로 있었고 걸은 거리도 사실이다.
         * 다만 걸을 수 없는 모양의 좌표를 '가 본 길'로 치지 않을 뿐이다.
         */
        const previousPaths = records
          .slice(0, 20)
          .map((r) => r.path)
          .filter((p) => isWalkablePath(p));

        /*
         * 후보 찾기가 통째로 던져도 최단 경로는 버리지 않는다.
         *
         * 바로 아래 주석이 "늘리진 못해도 최단 경로로라도 걷게 한다"고 약속하는데,
         * 그 약속은 후보가 **빈 배열**로 왔을 때만 지켜지고 있었다. 경유지 계산이나
         * 성질 계산이 한 번 던지면 여기서 그대로 실패 화면으로 갔다 — 관문을 이미
         * 지난, 손에 쥔 길 한 장을 두고서.
         */
        const candidates = await provider
          .candidates({
            origin,
            destination,
            targetSec: walkPlan.targetWalkSec,
            departAtMs: nowMs,
            previousPaths,
          })
          .catch(() => []);

        if (cancelled) return;

        // 경유지가 하나도 안 붙는 날이 있다(전부 도로망 밖이거나 호출이 다 실패).
        // 그때 빈 손으로 두면 걷기 화면이 좌표 없이 열려 도착을 영영 못 잡는다.
        // 늘리진 못해도 최단 경로는 있으니, 그걸로라도 걷게 한다.
        const usable = candidates.length > 0 ? candidates : [shortest];
        // 물러선 사실을 화면에 알린다. 늘리지 못했는데 "골라 온 길"이라고 하면
        // 15분에서 두 시간까지 일찍 도착하는 길에 그 약속을 붙이게 된다.
        setStretched(candidates.length > 0);

        const rankOptions = {
          targetSec: walkPlan.targetWalkSec,
          weights: weightsFor(mood, isShadeWorthy(nowMs, origin)),
          recentRouteIds: recent,
        };

        setRanked(rankRoutes(usable, rankOptions));
        // 늘린 후보가 전부 목표를 넘겨도 내놓을 한 장은 남겨 둔다.
        setFloor(rankRoutes([shortest], rankOptions)[0] ?? null);
      } catch (failure) {
        if (!cancelled) {
          /*
           * 원인을 살려서 보여준다.
           *
           * 예전엔 `catch {`로 받아 무조건 "잠시 뒤에 다시 해볼까요?"를 띄웠다.
           * 그런데 원인 중에는 기다려도 안 풀리는 것이 있다 — 도로가 없는 곳을
           * 찍었다든지. 그 사람에게 "잠시 뒤에"라고 하면 눌러도 같은 화면이
           * 돌아오는 막다른 길이 된다. 공급자들이 애써 남긴 마지막 실패 이유를
           * 여기서 버리지 않는다.
           */
          setError(routeFailureLine(failure));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
    // 날씨가 뒤늦게 읽혀 목표가 바뀌면 다시 계획한다. 5분으로 세운 계획에 7분 문구를 붙일 수는 없다.
  }, [destination, arriveAtMs, mood, earlySec, attempt]);

  /**
   * 목표 소요 시간. 계획이 없으면 잴 자가 없다.
   *
   * `too-late`에는 목표가 없다 — 그 화면은 길을 아예 안 보여주므로 0으로 둬도 된다.
   */
  const targetSec = plan != null && plan.kind !== 'too-late' ? plan.targetWalkSec : 0;

  /*
   * **늦는 것만은 어느 쪽으로도 새지 않는다.** 두 함수 모두 문턱을 넘긴 길을
   * 돌려주지 않고, 그래도 돌려줄 것이 없으면 최단 경로(`floor`)가 받는다 —
   * 늘리는 계획이 섰다는 건 최단이 목표 안에 든다는 뜻이라 늘 제때 닿는다.
   */
  const current =
    nextRoute(ranked, shownIds, targetSec) ?? firstRoute(ranked, targetSec) ?? floor;

  const showAnother = useCallback(() => {
    if (current != null) {
      setShownIds((prev) => [...prev, current.candidate.id]);
    }
  }, [current]);

  // 다시 찾을 땐 "이미 보여준 길"도 함께 지운다. 실패한 시도가 남긴 기억이
  // 새 후보를 가려 버리면 다시 찾기가 아니라 다른 길 찾기가 된다.
  const retry = useCallback(() => {
    setShownIds([]);
    setAttempt((n) => n + 1);
  }, []);

  return {
    loading,
    error,
    plan,
    route: current,
    hasAlternative:
      current != null &&
      nextRoute(ranked, [...shownIds, current.candidate.id], targetSec) != null,
    showAnother,
    retry,
    stretched,
    clockOffsetMs,
    onTarget: current != null && landsOnTarget(current.candidate.durationSec, targetSec),
    // 늘리는 계획에서만 뜻이 있다. 곧장 가는 계획은 최단이 곧 답이라 물러선 게 아니다.
    // 판정 자체는 도메인에 있다 — 여기서 손으로 비교하다 한 번 틀렸다.
    fallback: plan?.kind === 'stretch' && isFallbackRoute(current, floor),
  };
}

import { useCallback, useEffect, useState } from 'react';
import { Accuracy, getCurrentLocation, getServerTime } from '@apps-in-toss/framework';
import { MockRouteProvider, type RouteProvider } from '../data/route-provider';
import { TmapRouteProvider } from '../data/tmap-route-provider';
import { isTmapConfigured } from '../config';
import { recentRouteIds } from '../data/records';
import { isShadeWorthy } from '../domain/shade';
import { weightsFor } from '../domain/mood';
import { nextRoute, rankRoutes } from '../domain/route-plan';
import { planWalk, type WalkPlan } from '../domain/time';
import type { LatLng, MoodId, ScoredRoute } from '../domain/types';

/**
 * 키가 설정돼 있으면 실제 도보 경로를, 아니면 mock을 쓴다.
 * 키 없이도 화면 개발이 막히지 않아야 한다.
 */
function routeProvider(): RouteProvider {
  return isTmapConfigured() ? new TmapRouteProvider() : new MockRouteProvider();
}

export interface Suggestion {
  loading: boolean;
  error: string | null;
  plan: WalkPlan | null;
  route: ScoredRoute | null;
  /** 아직 안 보여준 다른 길이 남아 있는가 */
  hasAlternative: boolean;
  showAnother: () => void;
}

export interface SuggestionInput {
  destination: LatLng | null;
  arriveAtMs: number | null;
  mood: MoodId | null;
}

/**
 * 기기 시계는 믿지 않는다. 3분을 약속하는 앱에서 시계가 몇 분 틀어져 있으면
 * 그 자체로 제품이 거짓말을 하게 된다.
 */
async function now(): Promise<number> {
  const serverTime = await getServerTime().catch(() => undefined);
  return serverTime ?? Date.now();
}

export function useRouteSuggestion({
  destination,
  arriveAtMs,
  mood,
}: SuggestionInput): Suggestion {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<WalkPlan | null>(null);
  const [ranked, setRanked] = useState<ScoredRoute[]>([]);
  const [shownIds, setShownIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (destination == null || arriveAtMs == null || mood == null) {
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const [position, nowMs] = await Promise.all([
          getCurrentLocation({ accuracy: Accuracy.Balanced }),
          now(),
        ]);
        const origin: LatLng = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        const provider = routeProvider();
        const shortest = await provider.shortest(origin, destination);
        const walkPlan = planWalk({
          nowMs,
          arriveAtMs,
          shortestSec: shortest.durationSec,
        });

        if (cancelled) return;
        setPlan(walkPlan);

        // 곧장 가거나 이미 늦은 경우엔 후보를 찾을 이유가 없다.
        if (walkPlan.kind !== 'stretch') {
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

        const [candidates, recent] = await Promise.all([
          provider.candidates({
            origin,
            destination,
            targetSec: walkPlan.targetWalkSec,
            departAtMs: nowMs,
          }),
          recentRouteIds().catch(() => [] as string[]),
        ]);

        if (cancelled) return;

        setRanked(
          rankRoutes(candidates, {
            targetSec: walkPlan.targetWalkSec,
            weights: weightsFor(mood, isShadeWorthy(nowMs, origin)),
            recentRouteIds: recent,
          })
        );
      } catch {
        if (!cancelled) {
          setError('지금 위치를 확인하지 못했어요.');
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
  }, [destination, arriveAtMs, mood]);

  const current = nextRoute(ranked, shownIds) ?? ranked[0] ?? null;

  const showAnother = useCallback(() => {
    if (current != null) {
      setShownIds((prev) => [...prev, current.candidate.id]);
    }
  }, [current]);

  return {
    loading,
    error,
    plan,
    route: current,
    hasAlternative:
      current != null && nextRoute(ranked, [...shownIds, current.candidate.id]) != null,
    showAnother,
  };
}

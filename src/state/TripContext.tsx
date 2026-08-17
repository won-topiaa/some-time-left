import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import type { LatLng, MoodId, ScoredRoute } from '../domain/types';
import type { WalkPlan } from '../domain/time';

/**
 * 한 번의 이동에 대한 상태.
 * 화면 사이를 넘나드는 값이 몇 개 안 되므로 store 없이 context로 충분하다.
 */
export interface Trip {
  destinationName: string;
  destination: LatLng | null;
  /** 약속 시각 (epoch ms) */
  arriveAtMs: number | null;
  companion: string;
  mood: MoodId | null;
  plan: WalkPlan | null;
  /** 지금 제안 중인 경로 */
  route: ScoredRoute | null;
  /** 이미 보여준 경로들 — "다른 길"을 누를 때 건너뛴다 */
  shownRouteIds: string[];
  /** 걷기 시작한 시각 */
  startedAtMs: number | null;
}

const EMPTY: Trip = {
  destinationName: '',
  destination: null,
  arriveAtMs: null,
  companion: '',
  mood: null,
  plan: null,
  route: null,
  shownRouteIds: [],
  startedAtMs: null,
};

interface TripContextValue {
  trip: Trip;
  update: (patch: Partial<Trip>) => void;
  reset: () => void;
}

const TripContext = createContext<TripContextValue | null>(null);

export function TripProvider({ children }: PropsWithChildren) {
  const [trip, setTrip] = useState<Trip>(EMPTY);

  const update = useCallback((patch: Partial<Trip>) => {
    setTrip((prev) => ({ ...prev, ...patch }));
  }, []);

  const reset = useCallback(() => setTrip(EMPTY), []);

  const value = useMemo(() => ({ trip, update, reset }), [trip, update, reset]);

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

export function useTrip(): TripContextValue {
  const value = useContext(TripContext);
  if (value == null) {
    throw new Error('useTrip은 TripProvider 안에서만 쓸 수 있어요.');
  }
  return value;
}

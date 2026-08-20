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
  /** TMAP POI ID. 목적지 혼잡도를 조회할 때 쓴다. */
  destinationPoiId: string | null;
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
  /**
   * 서버 시각 − 기기 시각 (ms).
   *
   * 계획은 서버 시각으로 세우는데 걷는 화면과 도착 화면이 기기 시계로 세면
   * 시계가 틀어진 만큼 앱이 거짓말을 한다 — 3분을 약속하는 앱에서 이건 치명적이다.
   * 계획할 때 잰 차이를 여기 실어 두고, 이후 모든 화면이 `Date.now() + 이 값`으로 센다.
   * 서버 시각을 못 받으면 0이라 기기 시계 그대로 쓰는 것과 같아진다.
   */
  clockOffsetMs: number;
}

const EMPTY: Trip = {
  destinationName: '',
  destination: null,
  destinationPoiId: null,
  arriveAtMs: null,
  companion: '',
  mood: null,
  plan: null,
  route: null,
  shownRouteIds: [],
  startedAtMs: null,
  clockOffsetMs: 0,
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

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import type { LatLng, MoodId, ScoredRoute } from '../domain/types';

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
  /** 지금 제안 중인 경로 */
  route: ScoredRoute | null;
  /**
   * 약속보다 눈에 띄게 일찍 닿게 되는가.
   *
   * 두 경우다. (1) 여유가 너무 많아 길이 상한(최단의 2.2배)에서 잘렸을 때,
   * (2) 경유지가 하나도 도로망에 안 붙어 최단 경로로 물러섰을 때.
   * 둘 다 "3분 전 도착"을 지킬 수 없다는 점이 같다 — 걷는 화면이 이걸 모르면
   * 약속 시각까지를 세면서 "3분 전에 맞추고 있어요"라고 지키지 못할 말을 하게 된다.
   */
  arrivesEarly: boolean;
  /**
   * 이번 이동을 이미 기록에 남겼는가.
   *
   * 도착 화면 안의 ref로는 부족하다 — 뒤로 나갔다가 다시 들어오면 화면이 새로 만들어져
   * ref가 초기화되고, 한 번 걸은 일이 두 번 기록된다. 이동 하나에 하나만 남아야 하므로
   * 이동과 수명이 같은 이곳에 둔다. `reset()`이 다음 이동을 위해 지운다.
   */
  recordSaved: boolean;
  /**
   * 실제로 걸은 거리 (m). 위치를 한 번도 못 잡았으면 null.
   *
   * '이미 도착했어요'를 눌러 중간에 끝낼 수 있으니, 계획한 거리를 그대로 기록하면
   * 걷지 않은 길이 '지나온 길'의 누적 거리에 얹힌다. 그 숫자가 그 화면의 주인공이라
   * 부풀면 안 된다 — 걷는 화면이 마지막으로 안 만큼만 넘긴다.
   */
  walkedDistanceM: number | null;
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
  route: null,
  arrivesEarly: false,
  recordSaved: false,
  walkedDistanceM: null,
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

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import type { LatLng, MoodId, ScoredRoute } from '../domain/types';
import type { Weather } from '../domain/weather';
import { ARRIVE_EARLY_SEC } from '../domain/time';

/**
 * 한 번의 이동에 대한 상태.
 * 화면 사이를 넘나드는 값이 몇 개 안 되므로 store 없이 context로 충분하다.
 */
export interface Trip {
  destinationName: string;
  destination: LatLng | null;
  /** 약속 시각 (epoch ms) */
  arriveAtMs: number | null;
  /**
   * 첫 화면이 읽은 지금 날씨. 못 읽었으면 null.
   *
   * 여기 실어 두는 이유는 하나다 — "약속 몇 분 전"이 날씨로 갈리는데(비 오는 날은
   * 7분), 그 값을 길 찾기·걷기 화면이 **같은 날씨로** 내야 하기 때문이다. 화면마다
   * 따로 읽으면 하나는 5분, 하나는 7분을 말하는 날이 생긴다. 값은 저장하지 않고
   * 날씨만 저장한다 — 갈림은 `arriveEarlySecFor` 한 군데가 한다.
   */
  weather: Weather | null;
  companion: string;
  mood: MoodId | null;
  /** 지금 제안 중인 경로 */
  route: ScoredRoute | null;
  /**
   * 그 경로를 고를 때 계획이 겨눈 "약속 몇 초 전". 길과 함께 고정된다.
   *
   * 걷는 화면이 `weather`에서 다시 셈하면 안 된다. 첫 화면은 스택 아래에 살아 있어
   * 느리게 온 날씨를 걷는 도중에도 이동에 써넣는데, 그 순간 목표 시각이 2분 움직여
   * "7분 전에 맞추고 있어요"와 계획한 도착 시각이 서로 어긋난다. 계획한 값 하나를
   * 길과 같이 들고 다니면 그럴 수 없다.
   */
  earlySec: number;
  /**
   * 약속보다 눈에 띄게 일찍 닿게 되는가.
   *
   * 두 경우다. (1) 여유가 너무 많아 길이 상한(최단의 2.2배)에서 잘렸을 때,
   * (2) 경유지가 하나도 도로망에 안 붙어 최단 경로로 물러섰을 때.
   * 둘 다 약속 앞의 목표 시각에 맞춰 닿는다고 말할 수 없다는 점이 같다 — 걷는 화면이
   * 이걸 모르면 약속까지를 세면서 "먼저 도착하도록 맞추고 있어요"라고 지키지 못할 말을 한다.
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
   * 남긴 기록의 id. 아직 안 남겼으면 null.
   *
   * 도착 화면에서 뒤로 나갔다가 '이미 도착했어요'로 다시 들어오는 날이 있다.
   * 걸은 일은 한 번이라 기록을 또 만들지 않지만, 그때 적은 한 줄은 어딘가에 남아야
   * 한다 — 이 id가 그 자리다. 없으면 "남기고 닫기"가 아무것도 안 남기게 된다.
   */
  recordId: string | null;
  /**
   * 실제로 걸은 거리 (m). 위치를 한 번도 못 잡았으면 null.
   *
   * '이미 도착했어요'를 눌러 중간에 끝낼 수 있으니, 계획한 거리를 그대로 기록하면
   * 걷지 않은 길이 '지나온 길'의 누적 거리에 얹힌다. 그 숫자가 그 화면의 주인공이라
   * 부풀면 안 된다 — 걷는 화면이 마지막으로 안 만큼만 넘긴다.
   */
  walkedDistanceM: number | null;
  /**
   * 실제로 걸은 부분의 좌표. 위치를 한 번도 못 잡았으면 null.
   *
   * 거리와 같은 이유로 있다. '이미 도착했어요'로 중간에 끝냈는데 계획한 좌표열을
   * 통째로 기록하면, 걷지 않은 골목이 '가 본 길'로 남는다 — novelty가 그 좌표로
   * 계산되므로 다음 추천에서 정말 처음인 길을 "이미 걸었다"고 치게 되고,
   * 기록 글리프도 걷지 않은 모양을 그린다.
   */
  walkedPath: LatLng[] | null;
  /**
   * 서버 시각 − 기기 시각 (ms).
   *
   * 계획은 서버 시각으로 세우는데 걷는 화면과 도착 화면이 기기 시계로 세면
   * 시계가 틀어진 만큼 앱이 거짓말을 한다 — 분 단위를 약속하는 앱에서 이건 치명적이다.
   * 계획할 때 잰 차이를 여기 실어 두고, 이후 모든 화면이 `Date.now() + 이 값`으로 센다.
   * 서버 시각을 못 받으면 0이라 기기 시계 그대로 쓰는 것과 같아진다.
   */
  clockOffsetMs: number;
}

const EMPTY: Trip = {
  destinationName: '',
  destination: null,
  arriveAtMs: null,
  weather: null,
  companion: '',
  mood: null,
  route: null,
  earlySec: ARRIVE_EARLY_SEC,
  arrivesEarly: false,
  recordSaved: false,
  recordId: null,
  walkedDistanceM: null,
  walkedPath: null,
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

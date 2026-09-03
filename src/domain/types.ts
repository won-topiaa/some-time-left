export interface LatLng {
  lat: number;
  lng: number;
}

/** 사용자가 출발 전에 고르는 기분. 조건(경사·경치)을 직접 고르게 하지 않는다. */
export type MoodId =
  | 'pensive' // 생각이 많아요
  | 'excited' // 설레요
  | 'nervous' // 긴장돼요
  | 'tired' // 지쳤어요
  | 'plain' // 그냥 그래요
  | 'hot'; // 햇볕이 싫어요

/**
 * 경로가 가진 성질. 전부 0~1로 정규화한다.
 * 사용자에게 이 이름들을 그대로 노출하지 않는다 — 기분 라벨 뒤에 숨는다.
 */
export interface RouteFeatures {
  /** 한적함 (유동인구가 적음) */
  quiet: number;
  /** 평탄함 (누적 오르막이 적음) */
  flat: number;
  /** 그늘 (건물 그림자가 보도를 덮는 비율) */
  shade: number;
  /** 경치 (공원·수변·조망) */
  scenic: number;
  /** 처음 걷는 길의 비율 */
  novelty: number;
  /** 생각이 안 끊김 (신호등·횡단보도가 적음) */
  unbroken: number;
}

export type FeatureKey = keyof RouteFeatures;

export const FEATURE_KEYS: FeatureKey[] = [
  'quiet',
  'flat',
  'shade',
  'scenic',
  'novelty',
  'unbroken',
];

/** 진행 방향 기준으로 기술한 도로 구간. 그늘 계산의 최소 단위. */
export interface StreetSegment {
  /** 진행 방위각 (도, 북=0, 시계방향) */
  bearingDeg: number;
  /** 구간 길이 (m) */
  lengthM: number;
  /** 보도를 포함한 도로 폭 (m) */
  widthM: number;
  /** 진행 방향 왼쪽 건물 평균 높이 (m) */
  leftHeightM: number;
  /** 진행 방향 오른쪽 건물 평균 높이 (m) */
  rightHeightM: number;
}

export interface RouteCandidate {
  id: string;
  /** 예상 소요 시간 (초) */
  durationSec: number;
  distanceM: number;
  features: RouteFeatures;
  path: LatLng[];
  segments: StreetSegment[];
}

export interface ScoredRoute {
  candidate: RouteCandidate;
  /** 목표 소요 시간에 얼마나 맞는가 (0~1) */
  fit: number;
  /** 기분에 얼마나 맞는가 (0~1) */
  moodScore: number;
  /** 최종 점수 */
  score: number;
  /** 이 경로를 고르게 만든 성질 */
  /**
   * 이 길을 고르게 만든 성질. **두드러진 게 없으면 null**이고, 그때 화면은
   * 추천 이유를 아예 안 붙인다 — 재보지 못한 중립값을 이유로 대지 않기 위해서다.
   */
  dominantFeature: FeatureKey | null;
}

/** 도착하고 약속까지 남은 시간 동안 남기는 기록. */
export interface WalkRecord {
  id: string;
  /** 만난 사람 또는 모임 */
  companion: string;
  mood: MoodId;
  /** 무슨 생각을 하며 걸었는지 */
  note: string;
  /** 도착 시각 (epoch ms) */
  arrivedAt: number;
  destinationName: string;
  /**
   * 목적지 좌표.
   *
   * 첫 화면이 "최근에 간 곳"을 한 번 눌러 다시 고르게 하려면 이름만으로는
   * 부족하다 — 좌표가 없으면 검색을 다시 시켜야 하고, 그러면 눌러서 얻는 게 없다.
   * 이 값이 없는 옛 기록은 그 칩에서 빠질 뿐 나머지는 그대로 쓰인다.
   */
  destination?: LatLng;
  /**
   * 걸은 길의 좌표.
   *
   * 저장할 때 성기게 솎는다(`compactPath`). 이 좌표가 하는 일은 두 가지 —
   * 기록 화면의 리본 모양과 "가본 길인가" 판정 — 인데 둘 다 촘촘할 필요가 없고,
   * 원본 그대로 두면 기록 하나가 12KB씩 쌓여 나중엔 길 찾을 때마다
   * 메가바이트를 파싱하게 된다.
   */
  path: LatLng[];
  routeId: string;
  /**
   * 실제 걸은 거리 (m).
   *
   * 좌표를 솎으면 길이가 미세하게 줄어드는데, 누적 거리는 '지나온 길' 화면의
   * 주인공 숫자라 흔들리면 안 된다. 그래서 솎기 전 참값을 따로 적어 둔다.
   * 이 값이 없는 옛 기록은 좌표에서 계산한다.
   */
  distanceM?: number;
}

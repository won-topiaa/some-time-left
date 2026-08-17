/**
 * 걷는 중 페이스 코칭.
 *
 * 경로를 다시 그리는 것보다 속도를 미세 조정하는 쪽이 훨씬 자연스럽고 정확하다.
 * "조금 천천히 걸어도 돼요"는 이 앱에서 가장 다정한 문장이 될 수 있다.
 */

export type PaceAction = 'slower' | 'keep' | 'faster' | 'hurry';

export interface PaceInput {
  /** 남은 거리 (m) */
  remainingM: number;
  /** 목표 도착 시각까지 남은 시간 (초). 약속 시각이 아니라 3분 전 기준. */
  remainingSec: number;
  /** 최근 측정된 보행 속도 (m/s) */
  currentSpeedMps: number;
}

export interface PaceAdvice {
  action: PaceAction;
  /** 지금부터 이 속도로 걸으면 정확히 맞는다 (m/s) */
  requiredSpeedMps: number;
  /** 현재 속도를 유지하면 목표보다 이만큼 어긋난다 (초, 양수면 늦음) */
  predictedDeltaSec: number;
  message: string;
}

/** 성인 평균 보행 속도. 속도 측정이 아직 없을 때의 기본값. */
export const DEFAULT_WALK_SPEED_MPS = 1.25;

/** 이 이하로 느리면 서 있는 것으로 본다 (신호 대기 등). */
const STANDING_SPEED_MPS = 0.3;

/** 이 안쪽이면 "그대로"라고 말한다 (초). */
const KEEP_TOLERANCE_SEC = 45;

/** 이만큼 늦으면 걷기로는 못 맞춘다고 본다 (초). */
const HURRY_THRESHOLD_SEC = 150;

export function paceAdvice({
  remainingM,
  remainingSec,
  currentSpeedMps,
}: PaceInput): PaceAdvice {
  const requiredSpeedMps = remainingSec > 0 ? remainingM / remainingSec : Infinity;

  // 신호 대기 중이면 현재 속도로 예측해봐야 의미가 없다.
  const effectiveSpeed =
    currentSpeedMps < STANDING_SPEED_MPS ? DEFAULT_WALK_SPEED_MPS : currentSpeedMps;

  const predictedSec = remainingM / effectiveSpeed;
  const predictedDeltaSec = Math.round(predictedSec - remainingSec);

  if (predictedDeltaSec > HURRY_THRESHOLD_SEC) {
    return {
      action: 'hurry',
      requiredSpeedMps,
      predictedDeltaSec,
      message: '조금 서둘러야 해요.',
    };
  }

  if (predictedDeltaSec > KEEP_TOLERANCE_SEC) {
    return {
      action: 'faster',
      requiredSpeedMps,
      predictedDeltaSec,
      message: '지금보다 조금만 빠르게요.',
    };
  }

  if (predictedDeltaSec < -KEEP_TOLERANCE_SEC) {
    return {
      action: 'slower',
      requiredSpeedMps,
      predictedDeltaSec,
      message: '조금 천천히 걸어도 돼요.',
    };
  }

  return {
    action: 'keep',
    requiredSpeedMps,
    predictedDeltaSec,
    message: '지금 속도 그대로면 딱 맞아요.',
  };
}

/**
 * 위치 표본들로 최근 보행 속도를 추정한다.
 * GPS 튐을 줄이려고 마지막 몇 개만 쓰고 중앙값을 취한다.
 */
export function estimateSpeedMps(
  samples: { distanceFromPrevM: number; elapsedSec: number }[],
  window = 5
): number {
  const recent = samples.slice(-window).filter((s) => s.elapsedSec > 0);
  if (recent.length === 0) {
    return DEFAULT_WALK_SPEED_MPS;
  }
  const speeds = recent
    .map((s) => s.distanceFromPrevM / s.elapsedSec)
    .sort((a, b) => a - b);
  const mid = Math.floor(speeds.length / 2);
  return speeds.length % 2 === 0 ? (speeds[mid - 1] + speeds[mid]) / 2 : speeds[mid];
}

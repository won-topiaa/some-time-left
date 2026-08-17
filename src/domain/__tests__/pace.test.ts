import { describe, expect, it } from 'vitest';
import { DEFAULT_WALK_SPEED_MPS, estimateSpeedMps, paceAdvice } from '../pace';
import { bearingDeg, distanceM, remainingDistanceM } from '../geo';

describe('paceAdvice', () => {
  it('딱 맞으면 그대로 걸으라고 한다', () => {
    const advice = paceAdvice({
      remainingM: 1250,
      remainingSec: 1000,
      currentSpeedMps: 1.25,
    });

    expect(advice.action).toBe('keep');
    expect(Math.abs(advice.predictedDeltaSec)).toBeLessThan(45);
  });

  it('빠르면 천천히 걸어도 된다고 한다 — 이 앱에서 가장 다정한 문장', () => {
    const advice = paceAdvice({
      remainingM: 1000,
      remainingSec: 1000,
      currentSpeedMps: 1.6,
    });

    expect(advice.action).toBe('slower');
    expect(advice.predictedDeltaSec).toBeLessThan(0);
    expect(advice.message).toBe('조금 천천히 걸어도 돼요.');
  });

  it('조금 늦으면 조금만 빠르게', () => {
    const advice = paceAdvice({
      remainingM: 1300,
      remainingSec: 1000,
      currentSpeedMps: 1.15,
    });

    expect(advice.action).toBe('faster');
  });

  it('많이 늦으면 서두르라고 한다', () => {
    const advice = paceAdvice({
      remainingM: 1500,
      remainingSec: 900,
      currentSpeedMps: 1.0,
    });

    expect(advice.action).toBe('hurry');
  });

  it('신호 대기로 멈춰 있어도 지각으로 판정하지 않는다', () => {
    const advice = paceAdvice({
      remainingM: 1250,
      remainingSec: 1000,
      currentSpeedMps: 0, // 신호 대기
    });

    // 평균 보행 속도로 대체 계산하므로 여전히 '그대로'
    expect(advice.action).toBe('keep');
  });

  it('필요 속도를 함께 알려준다', () => {
    const advice = paceAdvice({
      remainingM: 1000,
      remainingSec: 800,
      currentSpeedMps: 1.25,
    });

    expect(advice.requiredSpeedMps).toBeCloseTo(1.25, 2);
  });
});

describe('estimateSpeedMps', () => {
  it('표본이 없으면 평균 보행 속도', () => {
    expect(estimateSpeedMps([])).toBe(DEFAULT_WALK_SPEED_MPS);
  });

  it('중앙값을 써서 GPS 튐을 흘려보낸다', () => {
    const samples = [
      { distanceFromPrevM: 6, elapsedSec: 5 },
      { distanceFromPrevM: 6.5, elapsedSec: 5 },
      { distanceFromPrevM: 60, elapsedSec: 5 }, // 튄 값
      { distanceFromPrevM: 6.2, elapsedSec: 5 },
      { distanceFromPrevM: 6.1, elapsedSec: 5 },
    ];

    expect(estimateSpeedMps(samples)).toBeCloseTo(1.24, 1);
  });
});

describe('geo', () => {
  const gwanghwamun = { lat: 37.5759, lng: 126.9769 };
  const cityHall = { lat: 37.5663, lng: 126.9779 };

  it('광화문–시청 거리는 약 1km', () => {
    const d = distanceM(gwanghwamun, cityHall);
    expect(d).toBeGreaterThan(950);
    expect(d).toBeLessThan(1150);
  });

  it('광화문에서 시청은 거의 남쪽', () => {
    const b = bearingDeg(gwanghwamun, cityHall);
    expect(b).toBeGreaterThan(165);
    expect(b).toBeLessThan(195);
  });

  it('출발점에서의 남은 거리는 경로 전체 길이와 같다', () => {
    const path = [gwanghwamun, { lat: 37.571, lng: 126.9774 }, cityHall];
    const remaining = remainingDistanceM(path, gwanghwamun);
    const total = distanceM(path[0], path[1]) + distanceM(path[1], path[2]);

    expect(remaining).toBeCloseTo(total, 0);
  });

  it('도착점에서의 남은 거리는 0에 가깝다', () => {
    const path = [gwanghwamun, cityHall];
    expect(remainingDistanceM(path, cityHall)).toBeLessThan(1);
  });
});

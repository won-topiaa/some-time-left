import { describe, expect, it } from 'vitest';
import { DEFAULT_WALK_SPEED_MPS, estimateSpeedMps, paceAdvice } from '../pace';
import { bearingDeg, distanceM, pathLengthM, remainingDistanceM } from '../geo';

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

  it('표본이 한둘뿐이면 추정하지 않는다 — 중앙값이 튐을 못 거른다', () => {
    // 하나면 중앙값이 곧 그 값이고, 둘이면 평균이라 절반이 섞인다.
    // 출발 직후 첫 측정이 튀었다고 "서두르세요"가 뜨면 안 된다.
    const spike = { distanceFromPrevM: 60, elapsedSec: 5 }; // 12 m/s — 사람이 아니다
    expect(estimateSpeedMps([spike])).toBe(DEFAULT_WALK_SPEED_MPS);
    expect(estimateSpeedMps([{ distanceFromPrevM: 6, elapsedSec: 5 }, spike])).toBe(
      DEFAULT_WALK_SPEED_MPS
    );
  });

  it('표본이 셋이면 그때부터 중앙값이 튐을 거른다', () => {
    const speed = estimateSpeedMps([
      { distanceFromPrevM: 6, elapsedSec: 5 },
      { distanceFromPrevM: 60, elapsedSec: 5 }, // 튄 값
      { distanceFromPrevM: 6.2, elapsedSec: 5 },
    ]);
    expect(speed).toBeCloseTo(1.24, 1);
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

  /**
   * 예전엔 가장 가까운 **꼭짓점**으로 스냅해서, 긴 구간의 앞쪽 절반을 걷는 동안
   * 남은 거리가 오히려 늘어났다 — 599m 경로에서 100m를 걸으면 699m가 남았다고 했다.
   * TMAP이 직진 구간을 좌표 두 개로 주는 일이 흔해서 드문 경우가 아니다.
   */
  describe('긴 구간을 걸어도 남은 거리는 줄기만 한다', () => {
    const start = { lat: 37.5665, lng: 126.978 };
    const north = (m: number) => ({ lat: start.lat + m / 111320, lng: start.lng });
    // 300m씩 두 구간. 중간 좌표가 없는 곧은 길.
    const path = [start, north(300), north(600)];

    it('걸을수록 단조 감소한다', () => {
      const walked = [0, 50, 100, 149, 151, 300, 450, 590];
      const readings = walked.map((m) => remainingDistanceM(path, north(m)));

      for (let i = 1; i < readings.length; i += 1) {
        expect(readings[i]).toBeLessThan(readings[i - 1]);
      }
    });

    it('경로 전체 길이를 넘지 않는다', () => {
      const total = pathLengthM(path);
      for (const m of [50, 100, 149, 299]) {
        expect(remainingDistanceM(path, north(m))).toBeLessThanOrEqual(total);
      }
    });

    it('실제 남은 거리와 1m 안쪽으로 맞는다', () => {
      // 남는 오차는 국소 평면 투영과 하버사인의 차이다. 600m에 0.5m 남짓이라
      // 도착 판정(40m)이나 페이스 계산에는 영향이 없다.
      const total = pathLengthM(path);
      for (const m of [50, 100, 149, 300, 450]) {
        expect(Math.abs(remainingDistanceM(path, north(m)) - (total - m))).toBeLessThan(1);
      }
    });

    it('걸은 거리(전체 − 남은)가 0으로 주저앉지 않는다', () => {
      // 이 값이 그대로 기록의 거리가 된다. 0이 되면 '지나온 길'의 누적이 안 늘어난다.
      const total = pathLengthM(path);
      const walked = total - remainingDistanceM(path, north(100));
      expect(walked).toBeGreaterThan(90);
    });
  });
});

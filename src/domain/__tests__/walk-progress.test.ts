import { describe, expect, it } from 'vitest';
import { pathLengthM, projectToPath, splitPath, walkProgress } from '../geo';
import type { LatLng } from '../types';

/**
 * 이 앱이 만드는 길은 일부러 늘린 길이라 제 옆을 스치거나 왔던 길을 되짚는다.
 * 그런 길에서 "얼마나 남았나"를 경로 전체에서 가장 가까운 곳으로만 구하면,
 * 위치가 십몇 미터만 흔들려도 반대편 구간으로 옮겨 붙어 남은 거리가 절반으로 튄다.
 * 화면의 숫자가 튀는 것으로 끝나지 않고, 40m 도착 판정까지 잘못 걸릴 수 있다.
 */
const start = { lat: 37.5665, lng: 126.978 };

/** 출발점에서 북(n)·동(e) 방향으로 m만큼. */
function at(n: number, e: number) {
  return {
    lat: start.lat + n / 111320,
    lng: start.lng + e / (111320 * Math.cos((start.lat * Math.PI) / 180)),
  };
}

/** 400m 올라갔다 20m 옆줄로 되짚어 내려오는 길. */
const OUT_AND_BACK = [at(0, 0), at(400, 0), at(400, 20), at(0, 20), at(0, 40)];

describe('walkProgress', () => {
  it('되짚어 오는 길에서도 남은 거리는 줄기만 한다', () => {
    const steps: [number, number][] = [
      [50, 0], [150, 0], [250, 0], [350, 0],
      [400, 10],
      [350, 20], [250, 20], [150, 20], [50, 20],
      [0, 30],
    ];

    let since = 0;
    let previous = Infinity;
    for (const [n, e] of steps) {
      const now = walkProgress(OUT_AND_BACK, at(n, e), { since });
      // 1m는 국소 평면 근사의 오차 여유다.
      expect(now.remainingM).toBeLessThanOrEqual(previous + 1);
      previous = now.remainingM;
      since = Math.max(since, now.alongRatio);
    }
  });

  it('진행을 넘기면 이미 지나온 구간으로 되돌아 붙지 않는다', () => {
    // 돌아오는 길 350m 지점. 나가는 구간과 20m밖에 안 떨어져 있어, 진행을 안 넘기면
    // 아직 나가는 중인 것처럼 읽힐 수 있다. 이미 절반을 지났다고 알려 주면 그럴 수 없다.
    const tracked = walkProgress(OUT_AND_BACK, at(350, 20), { since: 0.55 });

    expect(tracked.alongRatio).toBeGreaterThanOrEqual(0.55);
    // 나가는 구간(350m 지점, 비율 0.42)으로 붙었다면 남은 거리가 490m쯤 됐을 것이다.
    expect(tracked.remainingM).toBeLessThan(420);
  });

  it('그새 갈 수 있었던 것보다 멀리 나아가지 않는다', () => {
    // 나가는 길 200m 지점에서 위치가 16m 옆으로 튀면, 돌아오는 구간이 더 가까워진다.
    // 제한이 없으면 진행이 껑충 뛰어 남은 거리가 절반이 된다.
    const total = pathLengthM(OUT_AND_BACK);
    const before = walkProgress(OUT_AND_BACK, at(200, 0));

    const unbounded = walkProgress(OUT_AND_BACK, at(200, 16), {
      since: before.alongRatio,
    });
    const bounded = walkProgress(OUT_AND_BACK, at(200, 16), {
      since: before.alongRatio,
      // 3초 동안 5m쯤 걸었다면 여유를 얹어도 30m를 넘지 않는다.
      maxAdvanceM: 5 * 1.5 + 20,
    });

    expect(unbounded.remainingM).toBeLessThan(before.remainingM - 300);
    expect(before.remainingM - bounded.remainingM).toBeLessThan(40);
    expect(bounded.alongRatio - before.alongRatio).toBeLessThanOrEqual(30 / total + 1e-9);
  });

  it('곧은 길에서는 제한이 방해하지 않는다', () => {
    const straight = [at(0, 0), at(300, 0), at(600, 0)];
    const total = pathLengthM(straight);

    let since = 0;
    for (const n of [50, 100, 200, 400, 590]) {
      const now = walkProgress(straight, at(n, 0), { since, maxAdvanceM: 200 });
      expect(Math.abs(now.remainingM - (total - n))).toBeLessThan(2);
      since = now.alongRatio;
    }
  });

  it('숫자 하나만 넘겨도 진행 기준으로 읽는다', () => {
    const straight = [at(0, 0), at(600, 0)];
    expect(walkProgress(straight, at(300, 0), 0).remainingM).toBeCloseTo(
      walkProgress(straight, at(300, 0), { since: 0 }).remainingM,
      6
    );
  });

  it('빈 경로는 0으로 둔다', () => {
    expect(walkProgress([], at(0, 0))).toEqual({ remainingM: 0, alongRatio: 0, offPathM: 0 });
  });
});

describe('splitPath', () => {
  /** 동서로 곧은 길. 위도가 같아 구간 길이가 서로 같다. */
  const straight: LatLng[] = [
    { lat: 37.5, lng: 127.0 },
    { lat: 37.5, lng: 127.01 },
    { lat: 37.5, lng: 127.02 },
  ];

  it('점이 하나 이하면 나눌 게 없다', () => {
    expect(splitPath([], 0.5)).toBeNull();
    expect(splitPath([{ lat: 37.5, lng: 127 }], 0.5)).toBeNull();
  });

  it('한가운데면 가운데 점에서 갈린다', () => {
    const split = splitPath(straight, 0.5);
    expect(split?.at.lng).toBeCloseTo(127.01, 9);
  });

  it('0과 1은 양 끝', () => {
    expect(splitPath(straight, 0)?.at.lng).toBeCloseTo(127.0, 9);
    expect(splitPath(straight, 1)?.at.lng).toBeCloseTo(127.02, 9);
  });

  it('범위를 벗어난 값은 끝으로 잘린다', () => {
    expect(splitPath(straight, -1)?.at.lng).toBeCloseTo(127.0, 9);
    expect(splitPath(straight, 2)?.at.lng).toBeCloseTo(127.02, 9);
  });

  it('걸어온 길과 남은 길이 지금 자리에서 맞닿는다', () => {
    const split = splitPath(straight, 0.25);
    if (split == null) throw new Error('나뉘어야 한다');

    expect(split.walked[split.walked.length - 1]).toEqual(split.at);
    expect(split.ahead[0]).toEqual(split.at);
  });

  /*
   * 미터로 잰다. 도 단위로 재면 남북 1도와 동서 1도를 같게 보게 되는데,
   * 서울에서 동서 1도는 남북의 0.8배라 ㄱ자 길에서 점이 밀린다.
   */
  it('실제 거리로 나눈다', () => {
    const corner: LatLng[] = [
      { lat: 37.5, lng: 127.0 },
      { lat: 37.51, lng: 127.0 }, // 남북 — 더 길다
      { lat: 37.51, lng: 127.01 }, // 동서 — 더 짧다
    ];
    const split = splitPath(corner, 0.5);
    if (split == null) throw new Error('나뉘어야 한다');

    // 절반 지점은 아직 모서리에 못 미친다 — 첫 구간이 더 길기 때문.
    expect(split.at.lat).toBeLessThan(37.51);
    expect(split.at.lng).toBeCloseTo(127.0, 9);
  });

  it('길이가 없는 경로는 첫 점에 머문다', () => {
    const same: LatLng[] = [
      { lat: 37.5, lng: 127.0 },
      { lat: 37.5, lng: 127.0 },
    ];
    expect(splitPath(same, 0.7)?.at).toEqual(same[0]);
  });
});

/**
 * 도착 문턱에서 남은 거리가 Infinity로 튀지 않는다.
 *
 * walk 화면은 progress.current를 Math.max로 단조 증가시키다가 도착하면 1.0에
 * 이르는데, 그 다음 GPS 표본이 오면 projectToPath(path, at, 1)이 불린다.
 * 스킵 조건이 `<=`였을 때는 마지막 구간까지 건너뛰어 초깃값 Infinity가 그대로
 * 나왔고, 그 값이 "Infinitym 남았어요", 거짓 경로 이탈 진동, 그리고
 * `remainingM > 30`이 참이 되어 자동 도착이 막히는 것까지 번졌다.
 */
describe('projectToPath — 도착 문턱(minAlongRatio=1)', () => {
  it('마지막 구간을 통째로 건너뛰지 않는다 (Infinity 금지)', () => {
    const end = OUT_AND_BACK[OUT_AND_BACK.length - 1];
    const projection = projectToPath(OUT_AND_BACK, end, 1);
    expect(Number.isFinite(projection.distanceM)).toBe(true);
    // 도착점에 서 있으면 경로까지 거리는 0에 가깝다.
    expect(projection.distanceM).toBeLessThan(1);
    expect(projection.alongRatio).toBeCloseTo(1, 5);
  });

  it('도착점에서 walkProgress가 유한한 0에 가까운 값을 준다', () => {
    const end = OUT_AND_BACK[OUT_AND_BACK.length - 1];
    const walked = walkProgress(OUT_AND_BACK, end, { since: 1 });
    expect(Number.isFinite(walked.remainingM)).toBe(true);
    // 자동 도착 문턱(30m)을 넘지 않아야 걷는 화면에 갇히지 않는다.
    expect(walked.remainingM).toBeLessThan(30);
  });

  it('직선 두 점짜리 길에서도 Infinity가 아니다', () => {
    const straight = [at(0, 0), at(300, 0)];
    const projection = projectToPath(straight, at(300, 0), 1);
    expect(Number.isFinite(projection.distanceM)).toBe(true);
    expect(projection.alongRatio).toBeCloseTo(1, 5);
  });
});

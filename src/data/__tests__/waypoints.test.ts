import { describe, expect, it } from 'vitest';
import { offsetForTargetDistance, perpendicularWaypoint, planWaypoints, refineScale } from '../waypoints';
import { distanceM } from '../../domain/geo';

const GWANGHWAMUN = { lat: 37.5759, lng: 126.9769 };
const CITY_HALL = { lat: 37.5663, lng: 126.9779 };

describe('offsetForTargetDistance', () => {
  it('목표가 직선 거리 이하면 우회하지 않는다', () => {
    expect(offsetForTargetDistance(1000, 900)).toBe(0);
    expect(offsetForTargetDistance(1000, 1000)).toBe(0);
  });

  it('닫힌 형태가 실제로 목표 길이를 만든다', () => {
    const direct = 1000;
    const target = 1400;
    const offset = offsetForTargetDistance(direct, target);

    // 경유지를 거치는 경로 = 2 * sqrt((L/2)^2 + d^2)
    const achieved = 2 * Math.sqrt((direct / 2) ** 2 + offset ** 2);
    expect(achieved).toBeCloseTo(target, 6);
  });

  it('많이 늘릴수록 더 많이 벌어진다', () => {
    expect(offsetForTargetDistance(1000, 1600)).toBeGreaterThan(
      offsetForTargetDistance(1000, 1200)
    );
  });
});

describe('perpendicularWaypoint', () => {
  it('경유지를 거치면 목표한 만큼 길어진다', () => {
    const direct = distanceM(GWANGHWAMUN, CITY_HALL);
    const target = direct * 1.35;
    const offset = offsetForTargetDistance(direct, target);

    const waypoint = perpendicularWaypoint(GWANGHWAMUN, CITY_HALL, 0.5, offset);
    const viaLength =
      distanceM(GWANGHWAMUN, waypoint) + distanceM(waypoint, CITY_HALL);

    // 평면 근사라 오차가 조금 있지만 2% 안쪽이어야 한다
    expect(viaLength).toBeGreaterThan(target * 0.98);
    expect(viaLength).toBeLessThan(target * 1.02);
  });

  it('부호를 바꾸면 반대쪽으로 벌어진다', () => {
    const left = perpendicularWaypoint(GWANGHWAMUN, CITY_HALL, 0.5, 300);
    const right = perpendicularWaypoint(GWANGHWAMUN, CITY_HALL, 0.5, -300);

    // 남북 방향 경로이므로 좌우는 경도로 갈린다
    expect(left.lng).not.toBeCloseTo(right.lng, 4);
    expect(distanceM(left, right)).toBeGreaterThan(500);
  });

  it('offset이 0이면 선분 위에 그대로 있다', () => {
    const onLine = perpendicularWaypoint(GWANGHWAMUN, CITY_HALL, 0.5, 0);
    const direct = distanceM(GWANGHWAMUN, CITY_HALL);
    const via = distanceM(GWANGHWAMUN, onLine) + distanceM(onLine, CITY_HALL);

    expect(via).toBeCloseTo(direct, 1);
  });
});

describe('planWaypoints', () => {
  const base = {
    origin: GWANGHWAMUN,
    destination: CITY_HALL,
    speedMps: 1.25,
  };

  it('요청한 개수만큼 후보를 만든다', () => {
    const waypoints = planWaypoints({ ...base, targetSec: 1200, count: 6 });
    expect(waypoints).toHaveLength(6);
  });

  it('좌우 양쪽으로 흩어진다 — 한쪽으로만 몰리면 매번 같은 동네다', () => {
    const waypoints = planWaypoints({ ...base, targetSec: 1200, count: 6 });
    const midLng = (GWANGHWAMUN.lng + CITY_HALL.lng) / 2;

    expect(waypoints.some((w) => w.lng > midLng)).toBe(true);
    expect(waypoints.some((w) => w.lng < midLng)).toBe(true);
  });

  it('후보들이 서로 다른 지점이다', () => {
    const waypoints = planWaypoints({ ...base, targetSec: 1200, count: 6 });
    const keys = new Set(waypoints.map((w) => `${w.lat.toFixed(5)},${w.lng.toFixed(5)}`));

    expect(keys.size).toBe(waypoints.length);
  });

  it('늘릴 여유가 없으면 아무것도 만들지 않는다', () => {
    // 직선으로 이미 목표보다 오래 걸리는 경우
    expect(planWaypoints({ ...base, targetSec: 60 })).toEqual([]);
  });

  it('scale을 키우면 더 멀리 벌어진다', () => {
    const near = planWaypoints({ ...base, targetSec: 1200, count: 2, scale: 1 });
    const far = planWaypoints({ ...base, targetSec: 1200, count: 2, scale: 2 });

    const mid = { lat: (GWANGHWAMUN.lat + CITY_HALL.lat) / 2, lng: (GWANGHWAMUN.lng + CITY_HALL.lng) / 2 };
    expect(distanceM(far[0], mid)).toBeGreaterThan(distanceM(near[0], mid));
  });
});

describe('refineScale', () => {
  it('너무 짧게 나왔으면 배율을 키운다', () => {
    expect(refineScale(1000, 1600, 1)).toBeGreaterThan(1);
  });

  it('너무 길게 나왔으면 배율을 줄인다', () => {
    expect(refineScale(2000, 1600, 1)).toBeLessThan(1);
  });

  it('한 번에 절반만 반영해 크게 흔들리지 않는다', () => {
    // 목표가 2배라도 배율이 2배로 뛰지 않는다
    expect(refineScale(800, 1600, 1)).toBeLessThan(2);
  });

  it('범위를 벗어나지 않는다', () => {
    expect(refineScale(1, 100000, 1)).toBeLessThanOrEqual(3);
    expect(refineScale(100000, 1, 1)).toBeGreaterThanOrEqual(0.3);
  });

  it('말이 안 되는 입력에는 이전 배율을 유지한다', () => {
    expect(refineScale(0, 1600, 1.4)).toBe(1.4);
  });
});

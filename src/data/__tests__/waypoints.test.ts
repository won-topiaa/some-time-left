import { describe, expect, it } from 'vitest';
import {
  DETOUR_BIAS,
  WIDE_SPREAD,
  offsetForTargetDistance,
  perpendicularWaypoint,
  planWaypoints,
  refineScale,
  waypointMagnitude,
} from '../waypoints';
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

  /*
   * 오차를 **전부** 반영한다.
   *
   * 절반만 반영한 적이 있다. 크게 흔들리지 않게 하려던 것인데, 보정 라운드가
   * 한 번뿐이라 30% 빗나간 것이 15%만 줄고 그대로 화면에 나갔다 — 실측에서
   * 후보 10개가 전부 목표를 넘겨 관문을 통과한 것이 한 장뿐이었다.
   * 절반씩 다가가는 것은 라운드를 여러 번 돌 때의 이야기다.
   */
  it('오차를 전부 반영한다', () => {
    expect(refineScale(800, 1600, 1)).toBe(2);
    expect(refineScale(2400, 1600, 1)).toBeCloseTo(1600 / 2400, 6);
  });

  it('이전 배율에서 출발한다', () => {
    // 1라운드가 배율을 넓게 훑으므로, 가장 가까웠던 후보의 배율이 출발점이다.
    expect(refineScale(800, 1600, 0.5)).toBe(1);
  });

  it('이미 맞았으면 그대로 둔다', () => {
    expect(refineScale(1600, 1600, 0.8)).toBe(0.8);
  });

  it('범위를 벗어나지 않는다', () => {
    expect(refineScale(1, 100000, 1)).toBeLessThanOrEqual(3);
    expect(refineScale(100000, 1, 1)).toBeGreaterThanOrEqual(0.3);
  });

  it('말이 안 되는 입력에는 이전 배율을 유지한다', () => {
    expect(refineScale(0, 1600, 1.4)).toBe(1.4);
  });
});

/**
 * 후보가 목표를 **감싸는가.**
 *
 * 이 저장소가 실제로 겪은 실패다. 벌리는 양이 ±15%뿐이라 여섯 후보가 다 같은
 * 데 몰렸고, 기하 추정이 30% 넘게 과녁을 넘기는 바람에 열 개가 전부 목표보다
 * 길게 나왔다. `arrivesOnTime` 관문을 통과한 것이 한 장뿐이었고, 그래서 기분을
 * 바꿔도 고를 것이 없어 늘 같은 길이 나왔다.
 *
 * 도로망 응답은 비단조라서 "하나를 정확히 맞추기"로는 못 고친다. 대신 목표를
 * 양쪽에서 감싸도록 넓게 벌려 던지고 걸린 것을 쓴다 — 요청 수는 그대로다.
 */
describe('waypointMagnitude', () => {
  it('가운데가 1이고 양끝이 폭만큼 벌어진다', () => {
    const count = 6;
    expect(waypointMagnitude(0, count, 2)).toBeCloseTo(0.5, 6);
    expect(waypointMagnitude(count - 1, count, 2)).toBeCloseTo(2, 6);
    // 로그 간격이라 가운데가 1을 지난다.
    const mid = waypointMagnitude(2, count, 2) * waypointMagnitude(3, count, 2);
    expect(mid).toBeCloseTo(1, 6);
  });

  it('커지는 순서로 놓인다', () => {
    const got = [0, 1, 2, 3, 4, 5].map((i) => waypointMagnitude(i, 6));
    expect(got).toEqual([...got].sort((a, b) => a - b));
  });

  it('폭이 없거나 후보가 하나면 보정하지 않는다', () => {
    expect(waypointMagnitude(0, 1)).toBe(1);
    expect(waypointMagnitude(3, 6, 1)).toBe(1);
  });
});

describe('planWaypoints — 목표를 감싼다', () => {
  const directM = distanceM(CITY_HALL, GWANGHWAMUN);
  const speedMps = 1.25;
  const targetSec = 20 * 60;
  const targetM = targetSec * speedMps;

  /** 경유지를 지나는 삼각형 두 변의 길이. 기하 추정이 겨눈 값이다. */
  function triangleM(waypoint: { lat: number; lng: number }): number {
    return distanceM(CITY_HALL, waypoint) + distanceM(waypoint, GWANGHWAMUN);
  }

  const waypoints = planWaypoints({
    origin: CITY_HALL,
    destination: GWANGHWAMUN,
    targetSec,
    speedMps,
  });

  it('짧은 쪽과 긴 쪽이 모두 있다', () => {
    const lengths = waypoints.map(triangleM);

    expect(Math.min(...lengths)).toBeLessThan(targetM);
    expect(Math.max(...lengths)).toBeGreaterThan(targetM);
  });

  it('한 군데 몰려 있지 않다', () => {
    // 예전엔 ±15%뿐이라 여섯이 사실상 같은 길이였다.
    const lengths = waypoints.map(triangleM).sort((a, b) => a - b);
    const spread = lengths[lengths.length - 1] / lengths[0];

    expect(spread).toBeGreaterThan(1.5);
  });

  /*
   * 실측 근거. 겨냥 38분을 배율 1.0으로 던지니 50.0분과 58.1분이 왔고(+31%),
   * 목표에 닿은 배율은 0.6~0.7이었다. 그래서 기본을 미리 깎아 둔다.
   */
  it('기본 배율은 기하 추정보다 안쪽을 겨눈다', () => {
    expect(DETOUR_BIAS).toBeLessThan(1);

    const middle = planWaypoints({
      origin: CITY_HALL,
      destination: GWANGHWAMUN,
      targetSec,
      speedMps,
      count: 1,
    });
    // count 1이면 배수가 1이므로 순수하게 DETOUR_BIAS만 걸린다.
    expect(triangleM(middle[0])).toBeLessThan(targetM);
  });

  it('폭을 좁히면 덜 흩어진다', () => {
    const narrow = planWaypoints({
      origin: CITY_HALL,
      destination: GWANGHWAMUN,
      targetSec,
      speedMps,
      spread: 1.1,
    });
    const wide = planWaypoints({
      origin: CITY_HALL,
      destination: GWANGHWAMUN,
      targetSec,
      speedMps,
      spread: WIDE_SPREAD,
    });
    const range = (ps: typeof narrow) => {
      const ls = ps.map(triangleM);
      return Math.max(...ls) - Math.min(...ls);
    };

    expect(range(narrow)).toBeLessThan(range(wide));
  });
});

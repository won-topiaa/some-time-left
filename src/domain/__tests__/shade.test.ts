import { describe, expect, it } from 'vitest';
import { isShadeWorthy, routeShade, segmentShade } from '../shade';
import { solarPosition } from '../sun';
import type { StreetSegment } from '../types';

const SEOUL = { lat: 37.5665, lng: 126.978 };

/** 15m 폭, 양쪽 20m 건물, 진행 방위각만 바꿔가며 쓰는 기본 구간. */
function segment(overrides: Partial<StreetSegment> = {}): StreetSegment {
  return {
    bearingDeg: 0,
    lengthM: 100,
    widthM: 15,
    leftHeightM: 20,
    rightHeightM: 20,
    ...overrides,
  };
}

describe('solarPosition', () => {
  it('서울 한여름 정오에 해가 높이 뜨고 남쪽에 있다', () => {
    // 2026-08-17 12:00 KST = 03:00 UTC
    const sun = solarPosition(new Date(Date.UTC(2026, 7, 17, 3, 0)), SEOUL.lat, SEOUL.lng);

    expect(sun.altitudeDeg).toBeGreaterThan(60);
    expect(sun.altitudeDeg).toBeLessThan(75);
    // 서울의 남중은 12:30 무렵이라 12:00엔 아직 동쪽으로 치우쳐 있다
    expect(sun.azimuthDeg).toBeGreaterThan(140);
    expect(sun.azimuthDeg).toBeLessThan(180);
  });

  it('해가 진 뒤에는 고도가 음수다', () => {
    // 2026-08-17 22:00 KST = 13:00 UTC
    const sun = solarPosition(new Date(Date.UTC(2026, 7, 17, 13, 0)), SEOUL.lat, SEOUL.lng);
    expect(sun.altitudeDeg).toBeLessThan(0);
  });

  it('겨울 정오는 여름 정오보다 해가 낮다', () => {
    const summer = solarPosition(new Date(Date.UTC(2026, 5, 21, 3, 0)), SEOUL.lat, SEOUL.lng);
    const winter = solarPosition(new Date(Date.UTC(2026, 11, 21, 3, 0)), SEOUL.lat, SEOUL.lng);

    expect(winter.altitudeDeg).toBeLessThan(summer.altitudeDeg - 30);
  });

  it('오전에는 동쪽, 오후에는 서쪽에 있다', () => {
    const morning = solarPosition(new Date(Date.UTC(2026, 7, 17, 0, 0)), SEOUL.lat, SEOUL.lng); // 09:00 KST
    const afternoon = solarPosition(new Date(Date.UTC(2026, 7, 17, 8, 0)), SEOUL.lat, SEOUL.lng); // 17:00 KST

    expect(morning.azimuthDeg).toBeLessThan(180);
    expect(afternoon.azimuthDeg).toBeGreaterThan(180);
  });
});

describe('segmentShade', () => {
  it('해가 머리 위에 있으면 그늘이 거의 없다', () => {
    const shade = segmentShade(segment(), { altitudeDeg: 89, azimuthDeg: 180 });
    expect(shade).toBeLessThan(0.05);
  });

  it('해가 낮고 길과 직각이면 길이 통째로 그늘이다', () => {
    // 남북 도로(bearing 0), 해는 정서(270도), 고도 20도
    // 그림자 = 20 / tan(20°) ≈ 55m, 도로 폭 15m → 완전히 덮는다
    const shade = segmentShade(segment(), { altitudeDeg: 20, azimuthDeg: 270 });
    expect(shade).toBe(1);
  });

  it('해가 길과 나란하면 그림자가 길을 가로지르지 못해 그늘이 없다', () => {
    // 동서 도로(bearing 90)를 정서(270도)의 해가 정면으로 비춘다
    const shade = segmentShade(segment({ bearingDeg: 90 }), {
      altitudeDeg: 20,
      azimuthDeg: 270,
    });
    expect(shade).toBeCloseTo(0, 5);
  });

  it('해가 있는 쪽 건물만 그림자를 드리운다', () => {
    // 남북 도로, 해는 서쪽(270도) → 진행 방향 기준 왼쪽
    const leftOnly = segment({ leftHeightM: 30, rightHeightM: 0 });
    const rightOnly = segment({ leftHeightM: 0, rightHeightM: 30 });
    const sun = { altitudeDeg: 45, azimuthDeg: 270 };

    expect(segmentShade(leftOnly, sun)).toBeGreaterThan(0);
    expect(segmentShade(rightOnly, sun)).toBe(0);
  });

  it('같은 조건이면 건물이 높을수록 그늘이 많다', () => {
    const sun = { altitudeDeg: 60, azimuthDeg: 270 };
    const low = segmentShade(segment({ leftHeightM: 10 }), sun);
    const high = segmentShade(segment({ leftHeightM: 25 }), sun);

    expect(high).toBeGreaterThan(low);
  });

  it('같은 조건이면 길이 넓을수록 그늘 비율이 낮다', () => {
    const sun = { altitudeDeg: 60, azimuthDeg: 270 };
    const narrow = segmentShade(segment({ widthM: 8 }), sun);
    const wide = segmentShade(segment({ widthM: 30 }), sun);

    expect(narrow).toBeGreaterThan(wide);
  });

  it('해가 지면 그늘을 따지지 않는다', () => {
    expect(segmentShade(segment(), { altitudeDeg: -5, azimuthDeg: 280 })).toBe(1);
  });
});

describe('routeShade', () => {
  it('구간 길이로 가중 평균한다 — 짧은 골목이 전체를 흔들지 않는다', () => {
    const sun = { altitudeDeg: 20, azimuthDeg: 270 };
    const segments: StreetSegment[] = [
      segment({ lengthM: 900 }), // 그늘 1
      segment({ bearingDeg: 90, lengthM: 100 }), // 그늘 0
    ];

    expect(routeShade(segments, sun)).toBeCloseTo(0.9, 2);
  });

  it('구간이 없으면 0', () => {
    expect(routeShade([], { altitudeDeg: 45, azimuthDeg: 180 })).toBe(0);
  });
});

describe('isShadeWorthy', () => {
  it('한여름 한낮이면 참', () => {
    expect(isShadeWorthy(Date.UTC(2026, 7, 17, 4, 0), SEOUL)).toBe(true);
  });

  it('같은 날 저녁이면 거짓', () => {
    expect(isShadeWorthy(Date.UTC(2026, 7, 17, 10, 0), SEOUL)).toBe(false);
  });

  it('한겨울 한낮이면 거짓', () => {
    expect(isShadeWorthy(Date.UTC(2026, 0, 17, 3, 0), SEOUL)).toBe(false);
  });
});

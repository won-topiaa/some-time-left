import { describe, expect, it } from 'vitest';
import { arrowMetrics, arrowPolygon, routeArrows } from '../route-arrows';
import { distanceM, pathLengthM } from '../geo';
import type { LatLng } from '../types';

/** 상도동에서 남동쪽으로 뻗는 1km 남짓한 길. */
const walkPath: LatLng[] = [
  { lat: 37.5045, lng: 126.9425 },
  { lat: 37.5032, lng: 126.9448 },
  { lat: 37.5018, lng: 126.9471 },
  { lat: 37.4997, lng: 126.9495 },
  { lat: 37.4981, lng: 126.9522 },
];

describe('routeArrows', () => {
  it('간격만큼 떨어뜨려 놓는다', () => {
    const arrows = routeArrows(walkPath, 200);
    expect(arrows.length).toBeGreaterThan(2);
    for (let i = 1; i < arrows.length; i += 1) {
      // 굽은 길 위 두 점의 직선거리라 호 길이보다 짧다. 넉넉히 본다.
      expect(distanceM(arrows[i - 1].at, arrows[i].at)).toBeGreaterThan(120);
    }
  });

  it('첫 화살표가 출발점을 덮지 않는다 — 비어 있어야 할 표시다', () => {
    expect(distanceM(routeArrows(walkPath, 200)[0].at, walkPath[0])).toBeGreaterThan(50);
  });

  it('진행 방향을 가리킨다 — 뒤로 가는 화살표는 없다', () => {
    // 이 길은 전체적으로 남동(방위각 90~180도)으로 간다.
    for (const arrow of routeArrows(walkPath, 150)) {
      expect(arrow.headingDeg).toBeGreaterThan(90);
      expect(arrow.headingDeg).toBeLessThan(180);
    }
  });

  it('alongRatio가 커지며 놓인다 — 지나온 것을 걷어내는 열쇠다', () => {
    let previous = 0;
    for (const arrow of routeArrows(walkPath, 200)) {
      expect(arrow.alongRatio).toBeGreaterThan(previous);
      expect(arrow.alongRatio).toBeLessThanOrEqual(1);
      previous = arrow.alongRatio;
    }
  });

  it('걸어온 만큼을 걷어내면 앞쪽 것만 남는다', () => {
    const all = routeArrows(walkPath, 150);
    const ahead = all.filter((a) => a.alongRatio > 0.5);
    expect(ahead.length).toBeGreaterThan(0);
    expect(ahead.length).toBeLessThan(all.length);
  });

  it('간격이 길이보다 커도 하나는 놓는다 — 짧은 길이야말로 방향이 헷갈린다', () => {
    const arrows = routeArrows(walkPath, 99_999);
    expect(arrows).toHaveLength(1);
    expect(arrows[0].alongRatio).toBeCloseTo(0.5, 5);
  });

  it('길이 아니면 빈 손으로 돌아온다 — 던지지 않는다', () => {
    expect(routeArrows([], 100)).toEqual([]);
    expect(routeArrows([walkPath[0]], 100)).toEqual([]);
    // 같은 점만 둘. 길이가 0이라 놓을 자리가 없다.
    expect(routeArrows([walkPath[0], walkPath[0]], 100)).toEqual([]);
    expect(routeArrows(walkPath, 0)).toEqual([]);
    expect(routeArrows(walkPath, -5)).toEqual([]);
  });
});

describe('arrowPolygon', () => {
  const arrow = { at: { lat: 37.5, lng: 127 }, headingDeg: 0, alongRatio: 0.5 };

  /*
   * GeoJSON 폴리곤은 첫 점과 끝 점이 같아야 한다. 안 닫으면 MapLibre가 오류 없이
   * 그 도형을 통째로 안 그린다 — 화살표가 조용히 사라지는 유일한 길이다.
   */
  it('닫힌 링을 준다', () => {
    const ring = arrowPolygon(arrow, 40);
    expect(ring).toHaveLength(5);
    expect(ring[4]).toEqual(ring[0]);
    for (const p of ring) {
      expect(Number.isFinite(p.lat)).toBe(true);
      expect(Number.isFinite(p.lng)).toBe(true);
    }
  });

  it('북쪽을 보면 앞코가 북쪽, 날개는 뒤에서 좌우로 갈라진다', () => {
    const [tip, left, , right] = arrowPolygon(arrow, 40);
    expect(tip.lat).toBeGreaterThan(arrow.at.lat);
    expect(left.lat).toBeLessThan(arrow.at.lat);
    expect(right.lat).toBeLessThan(arrow.at.lat);
    expect(left.lng).toBeLessThan(right.lng);
  });

  it('동쪽을 보면 앞코가 동쪽에 있다', () => {
    const [tip] = arrowPolygon({ ...arrow, headingDeg: 90 }, 40);
    expect(tip.lng).toBeGreaterThan(arrow.at.lng);
    expect(Math.abs(tip.lat - arrow.at.lat)).toBeLessThan(1e-6);
  });

  it('크기를 키우면 그만큼 커진다', () => {
    const small = arrowPolygon(arrow, 20);
    const big = arrowPolygon(arrow, 60);
    expect(distanceM(big[0], big[1])).toBeGreaterThan(distanceM(small[0], small[1]) * 2);
  });
});

describe('arrowMetrics', () => {
  /*
   * 지도는 경계 상자를 화면에 꽉 맞춰 고정한다(fitBounds · interactive: false).
   * 그래서 화면상의 크기는 상자 대비 비율로 정해진다 — 길이에 비례해 잡으면
   * 꼬불꼬불한 길에서만 화살표가 커진다.
   */
  it('경로가 커지면 간격과 크기가 같은 비율로 커진다', () => {
    const near = arrowMetrics(walkPath);
    const far = arrowMetrics(
      walkPath.map((p) => ({ lat: 37.5 + (p.lat - 37.5) * 3, lng: 126.94 + (p.lng - 126.94) * 3 }))
    );
    expect(far.spacingM).toBeGreaterThan(near.spacingM * 2.5);
    expect(far.sizeM / far.spacingM).toBeCloseTo(near.sizeM / near.spacingM, 6);
  });

  it('화살표가 간격보다 작다 — 겹치면 길이 화살표에 덮인다', () => {
    const { spacingM, sizeM } = arrowMetrics(walkPath);
    expect(sizeM).toBeLessThan(spacingM);
  });

  /*
   * 위 검사는 4배 넘게 헐거워서 상수가 0.038이든 0.0038이든 0이든 다 통과한다.
   * 크기를 잘못 건드리면 화살표가 화면에서 사라지는데 tsc도 빌드도 조용하므로,
   * 비율 자체에 못을 박는다. 눈에 맞춰 값을 바꾸는 건 얼마든지 좋지만
   * 그때는 이 줄도 같이 고쳐야 한다 — 실수로 지나가지는 않게.
   */
  it('크기와 간격의 비율이 눈에 맞춰 둔 값 그대로다', () => {
    const { spacingM, sizeM } = arrowMetrics(walkPath);
    const diagonalM = distanceM(
      { lat: 37.4981, lng: 126.9425 },
      { lat: 37.5045, lng: 126.9522 }
    );
    expect(spacingM / diagonalM).toBeCloseTo(0.16, 4);
    expect(sizeM / diagonalM).toBeCloseTo(0.038, 4);
    // 화면에서 보이는 크기 — 간격의 4분의 1쯤이라야 길을 덮지 않으면서 읽힌다.
    expect(sizeM / spacingM).toBeCloseTo(0.2375, 4);
  });

  it('이 길에는 서넛에서 여남은 개가 놓인다', () => {
    const count = routeArrows(walkPath, arrowMetrics(walkPath).spacingM).length;
    expect(count).toBeGreaterThanOrEqual(3);
    expect(count).toBeLessThanOrEqual(12);
    expect(pathLengthM(walkPath)).toBeGreaterThan(900);
  });

  it('길이 아니면 0을 준다', () => {
    expect(arrowMetrics([])).toEqual({ spacingM: 0, sizeM: 0 });
    expect(arrowMetrics([walkPath[0], walkPath[0]])).toEqual({ spacingM: 0, sizeM: 0 });
  });
});

/**
 * 화살표 개수는 천장이 있어야 한다.
 *
 * 간격은 경계 상자 기준이라 화면상의 크기는 일정한데, 길이는 상자와 상관없이
 * 길어질 수 있다 — 좁은 동네 안에서 이리저리 꺾어 늘린 경로가 그렇다. 그 GeoJSON은
 * 위치가 들어올 때마다(3초·5m) 웹뷰로 주입되므로 개수가 곧 값이다.
 */
describe('개수 천장', () => {
  /** 100m 남짓한 상자 안에서 왕복하는 아주 긴 길. */
  const zigzag: LatLng[] = [];
  for (let i = 0; i < 400; i += 1) {
    zigzag.push({ lat: 37.5 + (i % 2) * 0.0009, lng: 127 + i * 0.0000025 });
  }

  it('상자에 비해 길이 유난히 길어도 개수가 폭발하지 않는다', () => {
    // 고치기 전 실측: 같은 입력에서 1,873개 · GeoJSON 470KB.
    expect(pathLengthM(zigzag)).toBeGreaterThan(30_000);
    const arrows = routeArrows(zigzag, arrowMetrics(zigzag).spacingM);
    expect(arrows.length).toBeLessThanOrEqual(40);
    expect(arrows.length).toBeGreaterThan(0);
  });

  it('간격을 아무리 잘게 줘도 마찬가지다', () => {
    // 이 길에 1cm 간격이면 천장 없이는 399만 개다(길이 39,930m ÷ 0.01).
    expect(routeArrows(zigzag, 0.01).length).toBeLessThanOrEqual(40);
  });

  /*
   * 천장이 **보통 경로의 간격까지 건드리면** 안 된다. 화면상의 크기를 일정하게
   * 지켜 주는 게 경계 상자 기준 간격인데, 천장이 그걸 덮어쓰면 멀쩡한 길에서
   * 화살표가 성겨진다. 그래서 개수가 아니라 **간격 자체**를 재서 확인한다.
   */
  it('보통 경로에서는 천장이 간격을 건드리지 않는다', () => {
    const { spacingM } = arrowMetrics(walkPath);
    const totalM = pathLengthM(walkPath);
    // 이 길의 간격은 178m, 천장이 요구하는 최소는 27.9m — 원래 값이 이긴다.
    expect(spacingM).toBeGreaterThan(totalM / 40);

    const arrows = routeArrows(walkPath, spacingM);
    // 첫 화살표는 반 칸 자리, 그 뒤로는 정확히 한 칸씩. 천장이 벌렸다면 어긋난다.
    expect(arrows[0].alongRatio * totalM).toBeCloseTo(spacingM / 2, 6);
    for (let i = 1; i < arrows.length; i += 1) {
      expect((arrows[i].alongRatio - arrows[i - 1].alongRatio) * totalM).toBeCloseTo(
        spacingM,
        6
      );
    }
    expect(arrows.length).toBeGreaterThan(1);
  });

  it('alongRatio는 천장에 걸려도 순서를 지킨다', () => {
    let previous = 0;
    for (const arrow of routeArrows(zigzag, 0.01)) {
      expect(arrow.alongRatio).toBeGreaterThan(previous);
      expect(arrow.alongRatio).toBeLessThanOrEqual(1);
      previous = arrow.alongRatio;
    }
  });
});

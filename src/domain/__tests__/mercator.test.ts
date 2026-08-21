import { describe, expect, it } from 'vitest';
import { mapView, toWorld } from '../../ui/mercator';
import type { LatLng } from '../types';

/** 성수동 일대. 실제로 걸을 만한 크기의 경로. */
const PATH: LatLng[] = [
  { lat: 37.5445, lng: 127.0557 },
  { lat: 37.5461, lng: 127.0588 },
  { lat: 37.5482, lng: 127.0609 },
  { lat: 37.5506, lng: 127.0591 },
  { lat: 37.5509, lng: 127.0556 },
];

const SIZE = { width: 350, height: 220 };

describe('toWorld', () => {
  /*
   * 웹 메르카토르의 정의 그 자체. 이게 틀리면 경로가 타일 위 엉뚱한 골목에 얹힌다 —
   * 지도에서 몇십 미터는 다른 길이다.
   */
  it('배율 0에서 세상 전체가 타일 하나다', () => {
    expect(toWorld({ lat: 0, lng: 0 }, 0)).toEqual({ x: 0.5, y: 0.5 });
    expect(toWorld({ lat: 0, lng: -180 }, 0).x).toBeCloseTo(0, 10);
    expect(toWorld({ lat: 0, lng: 180 }, 0).x).toBeCloseTo(1, 10);
  });

  it('배율이 하나 오르면 좌표가 두 배가 된다', () => {
    const at = { lat: 37.5, lng: 127.0 };
    const low = toWorld(at, 10);
    const high = toWorld(at, 11);
    expect(high.x).toBeCloseTo(low.x * 2, 9);
    expect(high.y).toBeCloseTo(low.y * 2, 9);
  });

  it('북쪽일수록 y가 작다', () => {
    expect(toWorld({ lat: 37.6, lng: 127 }, 14).y).toBeLessThan(
      toWorld({ lat: 37.5, lng: 127 }, 14).y
    );
  });

  it('서울이 알려진 타일에 떨어진다', () => {
    // 배율 16에서 성수동은 x=55897, y=25384 (실제로 받아 본 타일)
    const world = toWorld({ lat: 37.5445, lng: 127.0557 }, 16);
    expect(Math.floor(world.x)).toBe(55897);
    expect(Math.floor(world.y)).toBe(25384);
  });

  it('극지방 밖은 잘라서 무한대가 되지 않게 한다', () => {
    expect(Number.isFinite(toWorld({ lat: 90, lng: 0 }, 5).y)).toBe(true);
    expect(Number.isFinite(toWorld({ lat: -90, lng: 0 }, 5).y)).toBe(true);
  });
});

describe('mapView', () => {
  it('빈 경로나 크기가 없으면 판을 만들지 않는다', () => {
    expect(mapView([], SIZE)).toBeNull();
    expect(mapView(PATH, { width: 0, height: 220 })).toBeNull();
  });

  /* 재는 값이 아직 안 온 순간. 통과시키면 배율도 좌표도 전부 NaN인 판이 나온다. */
  it('크기가 숫자가 아니면 판을 만들지 않는다', () => {
    expect(mapView(PATH, { width: NaN, height: 220 })).toBeNull();
    expect(mapView(PATH, { width: 350, height: NaN })).toBeNull();
    expect(mapView(PATH, { width: undefined, height: 220 } as never)).toBeNull();
  });

  /*
   * 정수 배율로만 고르면 한 뼘 넘칠 때마다 경로가 절반으로 작아진다.
   * 실제로 화면 폭의 20%만 쓰는 그림이 나왔고, 그래서 소수 배율을 쓴다.
   */
  it('경로가 여백 안에 딱 차게 담긴다', () => {
    const view = mapView(PATH, SIZE);
    if (view == null) throw new Error('판이 있어야 한다');

    const points = PATH.map((at) => view.project(at));
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);

    // 상자 안에 있고
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(SIZE.width);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(SIZE.height);

    // 긴 쪽은 여백만 남기고 꽉 찬다 (여백 24)
    const filled = Math.max(
      (Math.max(...xs) - Math.min(...xs)) / (SIZE.width - 48),
      (Math.max(...ys) - Math.min(...ys)) / (SIZE.height - 48)
    );
    expect(filled).toBeCloseTo(1, 2);
  });

  it('경로의 한가운데가 화면 한가운데에 온다', () => {
    const view = mapView(PATH, SIZE);
    if (view == null) throw new Error('판이 있어야 한다');

    const points = PATH.map((at) => view.project(at));
    const midX = (Math.min(...points.map((p) => p.x)) + Math.max(...points.map((p) => p.x))) / 2;
    const midY = (Math.min(...points.map((p) => p.y)) + Math.max(...points.map((p) => p.y))) / 2;

    expect(midX).toBeCloseTo(SIZE.width / 2, 6);
    expect(midY).toBeCloseTo(SIZE.height / 2, 6);
  });

  /*
   * 타일 한 장이 실제 화소 512(받아 오는 `@2x` 원본 크기)에 가깝게 놓여야 한다.
   * 늘어나면 흐려지고, 줄어들면 타일에 구워진 글자가 안 읽힌다.
   * 반올림이라 최악이 √2배 — 어느 쪽으로도 한 단계를 다 잃지 않는다.
   */
  it('기기 화소에 맞춰 타일을 고른다', () => {
    for (const pixelRatio of [1, 2, 2.75, 3]) {
      const view = mapView(PATH, { ...SIZE, pixelRatio });
      if (view == null) throw new Error('판이 있어야 한다');

      const drawnPx = view.tilePx * pixelRatio;
      expect(drawnPx).toBeGreaterThan(512 / Math.SQRT2);
      expect(drawnPx).toBeLessThan(512 * Math.SQRT2);
    }
  });

  it('밀도를 안 주면 2배 화면으로 친다', () => {
    const view = mapView(PATH, SIZE);
    const same = mapView(PATH, { ...SIZE, pixelRatio: 2 });
    expect(view?.zoom).toBe(same?.zoom);
    expect(view?.tilePx).toBeCloseTo(same?.tilePx ?? -1, 9);
  });

  it('화면을 덮는 타일만 고른다', () => {
    const view = mapView(PATH, SIZE);
    if (view == null) throw new Error('판이 있어야 한다');

    expect(view.tiles.length).toBeGreaterThan(0);
    for (const tile of view.tiles) {
      // 상자 밖으로 완전히 벗어난 타일은 받을 이유가 없다.
      expect(tile.left).toBeLessThan(SIZE.width);
      expect(tile.top).toBeLessThan(SIZE.height);
      expect(tile.left + view.tilePx).toBeGreaterThan(0);
      expect(tile.top + view.tilePx).toBeGreaterThan(0);
    }
  });

  it('한 점뿐인 경로도 판이 된다', () => {
    const view = mapView([{ lat: 37.5, lng: 127.0 }], SIZE);
    if (view == null) throw new Error('판이 있어야 한다');

    const at = view.project({ lat: 37.5, lng: 127.0 });
    expect(at.x).toBeCloseTo(SIZE.width / 2, 6);
    expect(at.y).toBeCloseTo(SIZE.height / 2, 6);
  });

  it('타일 번호가 그 배율에 있는 값이다', () => {
    const view = mapView(PATH, SIZE);
    if (view == null) throw new Error('판이 있어야 한다');

    const n = 2 ** view.zoom;
    for (const tile of view.tiles) {
      expect(tile.x).toBeGreaterThanOrEqual(0);
      expect(tile.x).toBeLessThan(n);
      expect(tile.y).toBeGreaterThanOrEqual(0);
      expect(tile.y).toBeLessThan(n);
    }
  });
});

/**
 * 지도 타일과 경로를 같은 자리에 겹치기 위한 계산.
 *
 * `routeShape.ts`와 나란히 두지만 하는 일이 다르다. 저쪽은 경로의 **모양**만
 * 100×100 상자에 담는 것이고(기록 글리프처럼 실제 위치가 필요 없는 자리), 여기는
 * 타일 위에 정확히 얹어야 하므로 **웹 메르카토르**를 그대로 쓴다.
 * 위경도를 눌러 담는 방식으로는 타일과 몇십 미터씩 어긋난다 — 지도에서 그건 다른 골목이다.
 *
 * 좌표계는 셋이다.
 *   위경도  →  월드(타일 단위, 0~2^z)  →  화면 픽셀
 */

import { getApiConfig } from '../config';
import type { LatLng } from '../domain/types';

/** CARTO가 `@2x`로 주는 타일의 논리 크기. 실제 이미지는 512지만 256으로 그린다. */
export const TILE_SIZE = 256;

/** 이 이상 당기면 타일이 뭉개지고, 이 아래로는 골목이 안 보인다. */
const MIN_ZOOM = 11;
const MAX_ZOOM = 18;

export interface WorldPoint {
  /** 타일 단위. 정수 부분이 타일 번호, 소수 부분이 그 안에서의 자리. */
  x: number;
  y: number;
}

export function toWorld({ lat, lng }: LatLng, zoom: number): WorldPoint {
  const n = 2 ** zoom;
  const clampedLat = Math.min(85.05112878, Math.max(-85.05112878, lat));
  const radians = (clampedLat * Math.PI) / 180;
  return {
    x: ((lng + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * n,
  };
}

export interface Tile {
  x: number;
  y: number;
  zoom: number;
  /** 화면 안에서의 왼쪽 위 모서리 (px) */
  left: number;
  top: number;
}

export interface MapView {
  zoom: number;
  /** 타일 하나를 화면에 그릴 크기 (px). 소수 배율을 메우느라 TILE_SIZE보다 클 수 있다. */
  tilePx: number;
  tiles: Tile[];
  /** 위경도 → 화면 픽셀 */
  project: (at: LatLng) => { x: number; y: number };
}

export interface ViewSize {
  width: number;
  height: number;
  /**
   * 논리 1px을 실제 몇 px로 그리는 기기인가 (`PixelRatio.get()`).
   *
   * 이걸 모르면 타일을 얼마나 촘촘히 받아야 할지 정할 수 없다. 기본값 2는
   * 받아 오는 타일이 `@2x`(512px)라서다 — 2배 화면에서 논리 256px로 그리면
   * 원본과 실제 화소가 정확히 1:1이 된다.
   *
   * 계산을 순수하게 두려고 값으로 받는다. 여기서 react-native를 부르면
   * 이 파일이 노드에서 테스트되지 않는다.
   */
  pixelRatio?: number;
}

/** 경로가 상자에 닿지 않게 남기는 여백 (px). 선 끝과 점이 모서리에 붙으면 답답하다. */
const PADDING = 24;

/**
 * 경로 전체가 상자에 딱 차는 배율. **소수로 낸다.**
 *
 * 정수 단계로만 고르면 한 단계 차이가 두 배라, 한 뼘 넘칠 때마다 경로가 절반으로
 * 작아진다(실제로 화면 폭의 20%만 쓰는 그림이 나왔다). 소수로 내고 타일을 그만큼
 * 키워 그리면 딱 맞게 채울 수 있다.
 *
 * 키워도 뭉개지지 않는 건 `@2x` 타일을 받기 때문이다 — 실제 512px짜리를 256으로
 * 그리고 있으므로 512까지, 즉 한 단계분은 원본 해상도 안에서 커진다.
 */
function fitZoom(path: LatLng[], { width, height }: ViewSize): number {
  const innerW = Math.max(1, width - PADDING * 2);
  const innerH = Math.max(1, height - PADDING * 2);

  // 배율 0에서의 크기. 여기에 2^zoom을 곱하면 그 배율에서의 크기가 된다.
  const unit = path.map((at) => toWorld(at, 0));
  const spanX = Math.max(...unit.map((p) => p.x)) - Math.min(...unit.map((p) => p.x));
  const spanY = Math.max(...unit.map((p) => p.y)) - Math.min(...unit.map((p) => p.y));

  // 한 점에 몰려 있으면 담을 크기가 없다. 가장 당긴 배율로 그 자리를 보여준다.
  if (!(spanX > 0) && !(spanY > 0)) {
    return MAX_ZOOM;
  }

  const forX = spanX > 0 ? Math.log2(innerW / (spanX * TILE_SIZE)) : Infinity;
  const forY = spanY > 0 ? Math.log2(innerH / (spanY * TILE_SIZE)) : Infinity;

  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(forX, forY)));
}

/**
 * 경로를 담는 지도 한 판.
 *
 * 경로의 한가운데를 화면 한가운데에 놓고, 그 화면을 덮는 타일만 고른다.
 * 화면 밖 타일을 받으면 남의 무료 서비스를 쓰면서 데이터만 축내게 된다.
 */
export function mapView(path: LatLng[], size: ViewSize): MapView | null {
  // `<= 0`만 보면 NaN이 통과한다. 그러면 배율도 좌표도 전부 NaN인 판이 나오고,
  // 화면은 아무것도 안 그린 채 오류도 안 낸다 — 재는 값이 아직 안 온 순간이 그렇다.
  if (path.length === 0 || !(size.width > 0) || !(size.height > 0)) {
    return null;
  }

  const fitted = fitZoom(path, size);

  /*
   * 타일은 정수 배율로만 존재한다. 어느 쪽으로 반올림할지를 **기기 화소로 정한다.**
   *
   * 한쪽으로만 밀면 둘 중 하나를 잃는다. 내림이면 타일을 최대 두 배로 늘려 그려서
   * 3배 화면에서 512짜리가 1500px까지 벌어지고(흐려진다), 올림이면 절반으로 줄여
   * 그려서 타일에 구워진 글자가 절반 크기가 된다(안 읽힌다).
   *
   * 그래서 타일 하나가 실제 화소 512에 가장 가깝게 놓이는 배율을 고른다.
   * 그게 원본과 화면이 1:1이 되는 지점이고, 늘어나지도 줄어들지도 않는다.
   *   tilePx × pixelRatio = 512  →  zoom = fitted + log2(pixelRatio / 2)
   */
  const dpr = size.pixelRatio != null && size.pixelRatio > 0 ? size.pixelRatio : 2;
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(fitted + Math.log2(dpr / 2))));
  const tilePx = TILE_SIZE * 2 ** (fitted - zoom);

  const points = path.map((at) => toWorld(at, zoom));

  const centerX = (Math.min(...points.map((p) => p.x)) + Math.max(...points.map((p) => p.x))) / 2;
  const centerY = (Math.min(...points.map((p) => p.y)) + Math.max(...points.map((p) => p.y))) / 2;

  // 화면 왼쪽 위가 월드 어디인가 (타일 단위)
  const originX = centerX - size.width / 2 / tilePx;
  const originY = centerY - size.height / 2 / tilePx;

  const project = (at: LatLng) => {
    const world = toWorld(at, zoom);
    return { x: (world.x - originX) * tilePx, y: (world.y - originY) * tilePx };
  };

  const n = 2 ** zoom;
  const tiles: Tile[] = [];

  // 화면이 덮는 월드 범위(타일 단위). 이 안에 걸치는 타일만 받는다.
  const lastX = originX + size.width / tilePx;
  const lastY = originY + size.height / tilePx;

  for (let x = Math.floor(originX); x < lastX; x++) {
    for (let y = Math.floor(originY); y < lastY; y++) {
      // 세로는 감싸지 않는다 — 극지방 밖 타일은 존재하지 않는다.
      if (y < 0 || y >= n) {
        continue;
      }
      tiles.push({
        // 가로는 날짜변경선을 넘어가면 반대편으로 돈다.
        x: ((x % n) + n) % n,
        y,
        zoom,
        left: (x - originX) * tilePx,
        top: (y - originY) * tilePx,
      });
    }
  }

  return { zoom, tilePx, tiles, project };
}

/**
 * 타일 주소.
 *
 * 기본값은 CARTO Positron이고 **지금은 키 없이 받아진다**(실측).
 * 색이 옅어서 이 앱의 종이빛 바탕 위에 그대로 얹힌다 — 길이 흰 선, 건물이 옅은 회색,
 * 글자가 회청색. 크롬을 무채색으로 두는 원칙과 맞고, 그 위에 기분 색 하나만 얹히면
 * 색을 가진 게 우리 경로뿐이 된다.
 *
 * 주소는 `config.ts`에 있다. 무료 타일 서비스는 전부 SLA가 없어서, 막히거나 키를
 * 요구하게 되는 날 화면 코드를 고치지 않고 갈아탈 수 있어야 한다.
 */
export function tileUrl({ x, y, zoom }: Tile, scheme: 'light' | 'dark' = 'light'): string {
  const { mapTiles } = getApiConfig();
  const template = scheme === 'dark' ? mapTiles.darkUrlTemplate : mapTiles.urlTemplate;

  return template
    .replace('{z}', String(zoom))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
}

/**
 * 지도 위에 반드시 적어야 하는 출처.
 *
 * 데이터는 OpenStreetMap(ODbL), 그림은 CARTO — 둘 다 표기를 요구한다.
 * 화면에서 가장 작고 옅게 두되, **지우지는 않는다.**
 */
export function mapAttribution(): string {
  return getApiConfig().mapTiles.attribution;
}

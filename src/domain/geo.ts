import type { LatLng } from './types';

const EARTH_RADIUS_M = 6371008.8;
const DEG = Math.PI / 180;

/** 두 좌표 사이 거리 (m). Haversine. */
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * DEG;
  const dLng = (b.lng - a.lng) * DEG;
  const lat1 = a.lat * DEG;
  const lat2 = b.lat * DEG;

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** a에서 b를 향하는 방위각 (도, 북=0, 시계방향). */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const lat1 = a.lat * DEG;
  const lat2 = b.lat * DEG;
  const dLng = (b.lng - a.lng) * DEG;

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  return (((Math.atan2(y, x) * 180) / Math.PI) % 360 + 360) % 360;
}

/**
 * 저장할 때 좌표를 솎는 기본 간격 (m).
 *
 * "가본 길인가"를 60m 반경으로 판정하므로(`data/features.ts`) 그보다 촘촘하면
 * 판정이 달라지지 않는다. 25m면 넉넉히 안쪽이라 안전하고, TMAP이 주는
 * 6m 간격 좌표를 네 개 중 하나로 줄인다.
 */
export const COMPACT_SPACING_M = 25;

/**
 * 좌표를 성기게 솎는다.
 *
 * TMAP 경로 하나가 300점쯤 되어 기록 한 건이 12KB씩 붙는다. 기록은 지우지 않고
 * 쌓이기만 하는 것이라(그게 '지나온 길'의 존재 이유다) 그대로 두면 백 번쯤 걸었을 때
 * 길 찾을 때마다 1MB를 파싱하게 된다 — 가장 열심히 쓴 사람이 가장 오래 기다린다.
 *
 * 꺾인 각도를 보지 않고 거리만 본다. 리본은 작게 그려지고 판정 반경은 25m보다
 * 넓어서 이 정도로 모양도 판정도 그대로다. 처음과 끝은 언제나 남긴다.
 */
export function compactPath(path: LatLng[], spacingM = COMPACT_SPACING_M): LatLng[] {
  if (path.length <= 2) {
    return [...path];
  }

  const out: LatLng[] = [path[0]];
  let anchor = path[0];

  for (let i = 1; i < path.length - 1; i += 1) {
    if (distanceM(anchor, path[i]) >= spacingM) {
      out.push(path[i]);
      anchor = path[i];
    }
  }

  out.push(path[path.length - 1]);
  return out;
}

/** 경로 전체 길이 (m). */
export function pathLengthM(path: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    total += distanceM(path[i - 1], path[i]);
  }
  return total;
}

/** 경로 위에서 현재 위치에 가장 가까운 지점 이후의 남은 거리 (m). */
export function remainingDistanceM(path: LatLng[], current: LatLng): number {
  if (path.length === 0) {
    return 0;
  }

  let nearestIndex = 0;
  let nearestDistance = Infinity;
  for (let i = 0; i < path.length; i += 1) {
    const d = distanceM(path[i], current);
    if (d < nearestDistance) {
      nearestDistance = d;
      nearestIndex = i;
    }
  }

  let remaining = distanceM(current, path[nearestIndex]);
  for (let i = nearestIndex + 1; i < path.length; i += 1) {
    remaining += distanceM(path[i - 1], path[i]);
  }
  return remaining;
}

/**
 * 한 지점에서 동/북 방향으로 미터만큼 이동한 좌표.
 * 우회 경유지를 만들 때 쓴다. 수 km 범위에서는 평면 근사로 충분하다.
 */
export function offsetPoint(p: LatLng, eastM: number, northM: number): LatLng {
  const metersPerDegLat = 111320;
  const metersPerDegLng = metersPerDegLat * Math.cos(p.lat * DEG);
  return {
    lat: p.lat + northM / metersPerDegLat,
    lng: p.lng + eastM / Math.max(1e-6, metersPerDegLng),
  };
}

/** 두 좌표를 t(0~1)로 내분한 지점. */
export function interpolate(a: LatLng, b: LatLng, t: number): LatLng {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

export interface SideOfLine {
  /**
   * 선분 기준 부호 있는 수직 거리 (m).
   * 진행 방향 기준으로 음수면 왼쪽, 양수면 오른쪽.
   */
  distanceM: number;
  /** 선분 위 투영 위치 (0=시작, 1=끝). 범위를 벗어나면 선분 밖이다. */
  alongRatio: number;
}

/**
 * 점이 선분의 어느 쪽에 있는가.
 * 그늘 계산에서 "해가 있는 쪽 건물"을 가르려면 좌우 구분이 필요하다.
 */
export function signedSideOf(from: LatLng, to: LatLng, point: LatLng): SideOfLine {
  // 국소 평면으로 투영한다. 수십 미터 범위이므로 오차는 무시할 수 있다.
  const metersPerDegLat = 111320;
  const metersPerDegLng = metersPerDegLat * Math.cos(from.lat * DEG);

  const ax = 0;
  const ay = 0;
  const bx = (to.lng - from.lng) * metersPerDegLng;
  const by = (to.lat - from.lat) * metersPerDegLat;
  const px = (point.lng - from.lng) * metersPerDegLng;
  const py = (point.lat - from.lat) * metersPerDegLat;

  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) {
    return { distanceM: Math.hypot(px, py), alongRatio: 0 };
  }

  const alongRatio = (px * dx + py * dy) / lengthSq;
  // 외적의 부호가 좌우를 가른다. 화면 좌표가 아니라 동-북 좌표이므로
  // 진행 방향 오른쪽이 양수가 되도록 부호를 잡는다.
  const cross = dx * py - dy * px;

  return { distanceM: -cross / Math.sqrt(lengthSq), alongRatio };
}

export interface PathProjection {
  /** 경로에서 점까지의 최단 거리 (m) */
  distanceM: number;
  /** 경로 위 위치 (0=출발, 1=도착). "길 중간쯤인가"를 판단할 때 쓴다. */
  alongRatio: number;
}

/**
 * 점을 경로(폴리라인)에 투영한다.
 *
 * 가장 가까운 구간을 찾아 그 구간 위 수선의 발까지의 거리와,
 * 경로 전체에서의 진행 비율을 돌려준다. "경로 곁에 있는 가게인가,
 * 있다면 길 중간쯤인가"를 판단하는 데 쓴다.
 */
export function projectToPath(path: LatLng[], point: LatLng): PathProjection {
  if (path.length === 0) {
    return { distanceM: Infinity, alongRatio: 0 };
  }
  if (path.length === 1) {
    return { distanceM: distanceM(path[0], point), alongRatio: 0 };
  }

  const total = pathLengthM(path);
  let best: PathProjection = { distanceM: Infinity, alongRatio: 0 };
  let travelled = 0;

  for (let i = 1; i < path.length; i += 1) {
    const from = path[i - 1];
    const to = path[i];
    const segLen = distanceM(from, to);
    const side = signedSideOf(from, to, point);

    // 구간 밖으로 투영되면 가까운 끝점으로 잘라낸다.
    const clamped = Math.min(1, Math.max(0, side.alongRatio));
    const foot = interpolate(from, to, clamped);
    const d = distanceM(foot, point);

    if (d < best.distanceM) {
      const alongM = travelled + clamped * segLen;
      best = { distanceM: d, alongRatio: total > 0 ? alongM / total : 0 };
    }
    travelled += segLen;
  }

  return best;
}

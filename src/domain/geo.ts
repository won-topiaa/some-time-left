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

/**
 * 경로 위에서 현재 위치 이후의 남은 거리 (m).
 *
 * **꼭짓점이 아니라 선분 위의 한 점을 찾아야 한다.** 가장 가까운 꼭짓점으로 스냅하면,
 * 한 구간의 앞쪽 절반을 걷는 동안 남은 거리가 오히려 **늘어난다** — 아직 지나지 않은
 * 그 꼭짓점까지의 거리가 통째로 더해지기 때문이다.
 *
 * TMAP은 직진 구간을 좌표 두 개로 주기도 한다(이 저장소의 파싱 테스트 픽스처가
 * 그런 300m 한 구간이다). 그런 길에서 100m를 걸으면 599m짜리 경로에 699m가 남았다고
 * 말하게 되고, 그 값이 그대로
 *   - 페이스 안내로 가서 일찍 가는 사람에게 서두르라 하고,
 *   - 화면의 "N m 남았어요"를 한 구간씩 뛰게 하고,
 *   - 걸은 거리(전체 − 남은)를 0으로 만들어 기록을 0m로 남긴다.
 * 세 가지 모두 "숫자가 흔들리면 안 된다"는 이 앱의 약속을 정면으로 깬다.
 */
export function remainingDistanceM(
  path: LatLng[],
  current: LatLng,
  minAlongRatio = 0
): number {
  return walkProgress(path, current, minAlongRatio).remainingM;
}

export interface WalkProgress {
  /** 남은 거리 (m) */
  remainingM: number;
  /** 경로 위 진행 비율 (0~1). 다음 호출에 그대로 넘기면 뒤로 미끄러지지 않는다. */
  alongRatio: number;
}

export interface WalkProgressOptions {
  /** 직전까지 온 만큼 (0~1). 넘기면 진행이 뒤로 가지 않는다. */
  since?: number;
  /**
   * 직전 측정 이후 실제로 움직일 수 있었던 최대 거리 (m).
   *
   * 뒤로 못 가게 막는 것만으로는 부족하다. 나갔다 되짚어 오는 길에서 두 갈래가
   * 20m쯤 떨어져 있으면, 위치가 십몇 미터 흔들렸을 때 아직 걷지도 않은 **앞쪽**
   * 구간이 더 가까워져 진행이 껑충 뛴다 — 남은 거리가 639m에서 224m로 줄고,
   * 심하면 도착으로 잘못 판정한다. 사람이 그새 갈 수 있었던 만큼까지만 나아간다.
   */
  maxAdvanceM?: number;
}

/**
 * 지금 어디쯤 왔고 얼마나 남았는가.
 *
 * 앞 호출의 `alongRatio`와 그새 움직인 거리를 넘기면, 진행이 뒤로도 앞으로도
 * 튀지 않는다. 일부러 늘린 길은 제 옆을 스치거나 왔던 길을 되짚기 때문에
 * 이 두 가지가 없으면 남은 거리가 한 번에 절반씩 뛴다.
 */
export function walkProgress(
  path: LatLng[],
  current: LatLng,
  options: number | WalkProgressOptions = {}
): WalkProgress {
  if (path.length === 0) {
    return { remainingM: 0, alongRatio: 0 };
  }

  const { since = 0, maxAdvanceM } =
    typeof options === 'number' ? { since: options } : options;

  const total = pathLengthM(path);
  // 경로에서 벗어나 있으면 되돌아갈 거리도 남은 거리다.
  const projection = projectToPath(path, current, since);

  let alongRatio = projection.alongRatio;
  if (maxAdvanceM != null && total > 0) {
    const ceiling = since + Math.max(0, maxAdvanceM) / total;
    alongRatio = Math.min(alongRatio, ceiling);
  }

  return {
    remainingM: projection.distanceM + total * (1 - alongRatio),
    alongRatio,
  };
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

export interface PathSplit {
  /** 걸어온 부분. 지금 자리에서 끝난다. */
  walked: LatLng[];
  /** 남은 부분. 지금 자리에서 시작한다. */
  ahead: LatLng[];
  /** 지금 있는 자리 */
  at: LatLng;
}

/**
 * 경로를 지금 자리에서 둘로 나눈다.
 *
 * `walkProgress`가 주는 비율은 **미터**로 잰 것이므로 여기서도 미터로 잰다.
 * 화면 좌표로 나누는 `routeShape.splitAtRatio`와 짝이지만, 이쪽은 좌표계를 거치지
 * 않는다 — 지도(MapLibre)에는 위경도를 그대로 넘기기 때문이다.
 */
export function splitPath(path: LatLng[], ratio: number): PathSplit | null {
  if (path.length < 2) {
    return null;
  }

  const steps = path.slice(1).map((point, i) => distanceM(path[i], point));
  const total = steps.reduce((sum, step) => sum + step, 0);

  if (!(total > 0)) {
    return { walked: [path[0]], ahead: [...path], at: path[0] };
  }

  let remaining = total * Math.min(1, Math.max(0, ratio));

  for (let i = 0; i < steps.length; i++) {
    if (remaining > steps[i]) {
      remaining -= steps[i];
      continue;
    }
    const at = interpolate(path[i], path[i + 1], steps[i] === 0 ? 0 : remaining / steps[i]);
    return { walked: [...path.slice(0, i + 1), at], ahead: [at, ...path.slice(i + 1)], at };
  }

  const last = path[path.length - 1];
  return { walked: [...path], ahead: [last], at: last };
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
export function projectToPath(
  path: LatLng[],
  point: LatLng,
  /**
   * 이 지점보다 앞은 보지 않는다 (0~1).
   *
   * 일부러 늘린 길은 제 옆을 스치거나 왔던 길을 되짚기도 한다. 그런 길에서는
   * 경로 전체에서 가장 가까운 곳을 찾으면, 위치가 십몇 미터만 흔들려도 반대편
   * 구간으로 옮겨 붙는다 — 남은 거리가 837m에서 413m로 튀고, 심하면 도착으로
   * 잘못 판정한다. 이미 지나온 만큼을 넘겨주면 그 뒤에서만 찾는다.
   */
  minAlongRatio = 0
): PathProjection {
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
    let clamped = Math.min(1, Math.max(0, side.alongRatio));

    // 이미 지나온 지점보다 앞이면, 이 구간에서 볼 수 있는 가장 이른 자리로 당긴다.
    if (minAlongRatio > 0 && total > 0) {
      const floorM = minAlongRatio * total;
      if (travelled + segLen <= floorM) {
        travelled += segLen;
        continue;
      }
      if (segLen > 0) {
        clamped = Math.max(clamped, Math.min(1, (floorM - travelled) / segLen));
      }
    }

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

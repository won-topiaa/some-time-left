/**
 * 경로 좌표열 → SVG 좌표.
 *
 * 컴포넌트에서 떼어낸 이유는 두 가지다. 미리보기(큰 리본)와 기록 글리프(작은 리본)가
 * 같은 계산을 쓰고, 좌표 변환은 조용히 틀리기 쉬워서 테스트로 묶어두는 편이 낫다.
 * (위도는 위로 갈수록 커지므로 y를 뒤집어야 한다 — 안 뒤집으면 남북이 거꾸로 그려진다.)
 */

import type { LatLng } from '../domain/types';

export interface Point {
  x: number;
  y: number;
}

/** 뷰박스는 항상 100×100. 바깥 여백을 남겨 선 끝이 잘리지 않게 한다. */
export const VIEWBOX = 100;

interface Bounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

function boundsOf(path: LatLng[]): Bounds {
  return path.reduce<Bounds>(
    (acc, p) => ({
      minLat: Math.min(acc.minLat, p.lat),
      maxLat: Math.max(acc.maxLat, p.lat),
      minLng: Math.min(acc.minLng, p.lng),
      maxLng: Math.max(acc.maxLng, p.lng),
    }),
    { minLat: Infinity, maxLat: -Infinity, minLng: Infinity, maxLng: -Infinity }
  );
}

/**
 * 경로를 뷰박스 안에 담는다.
 *
 * 가로세로 비율을 유지한다 — 늘려서 채우면 남북으로 곧은 길과 동서로 곧은 길이
 * 똑같은 모양이 되어, 기록을 모아 놨을 때 서로 구분이 안 된다.
 * 그래서 긴 쪽에 맞춰 축척을 정하고 짧은 쪽은 가운데로 민다.
 */
export function projectPath(path: LatLng[], padding = 10): Point[] {
  if (path.length === 0) {
    return [];
  }

  const b = boundsOf(path);
  const spanLat = b.maxLat - b.minLat;
  const spanLng = b.maxLng - b.minLng;

  const inner = VIEWBOX - padding * 2;
  // 위도 1도와 경도 1도의 실제 거리가 다르지만, 한 경로 안에서는 위도 차이가 작아
  // 그 보정까지 하면 오히려 모양이 왜곡된다. 여기서는 도 단위 그대로 비율만 맞춘다.
  const span = Math.max(spanLat, spanLng);

  // 한 점에 몰려 있거나 좌표가 모두 같으면 가운데 점 하나로 둔다.
  if (!(span > 0)) {
    const center = padding + inner / 2;
    return path.map(() => ({ x: center, y: center }));
  }

  const scale = inner / span;
  // 짧은 축이 남긴 여백의 절반만큼 밀어 가운데 정렬.
  const offsetX = (inner - spanLng * scale) / 2;
  const offsetY = (inner - spanLat * scale) / 2;

  return path.map((p) => ({
    x: padding + offsetX + (p.lng - b.minLng) * scale,
    y: padding + offsetY + (b.maxLat - p.lat) * scale,
  }));
}

export function toSvgPath(points: Point[]): string {
  if (points.length < 2) {
    return '';
  }
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ');
}

/**
 * 그려진 선 위에서 지금 어디쯤인가.
 *
 * 걷는 화면이 "따라갈 수 있는 그림"이 되려면 걸어온 만큼과 남은 만큼이
 * 갈라져야 한다. 선 하나만 있으면 방향도 위치도 알 수 없다.
 *
 * 길이는 **그려진 좌표계**에서 잰다. 미터로 재면 그림과 어긋난 자리에 점이 찍힌다 —
 * 여기서 필요한 건 실제 거리가 아니라 그림 위의 자리다.
 */
export interface SplitPath {
  /** 걸어온 부분. 점이 하나 이하면 아직 시작 언저리다. */
  walked: Point[];
  /** 남은 부분. 현재 위치에서 시작한다. */
  ahead: Point[];
  /** 지금 있는 자리 */
  at: Point;
}

function lengthsOf(points: Point[]): { steps: number[]; total: number } {
  const steps: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const step = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    steps.push(step);
    total += step;
  }
  return { steps, total };
}

export function splitAtRatio(points: Point[], ratio: number): SplitPath | null {
  if (points.length < 2) {
    return null;
  }

  const clamped = Math.min(1, Math.max(0, ratio));
  const { steps, total } = lengthsOf(points);

  if (!(total > 0)) {
    return { walked: [points[0]], ahead: [...points], at: points[0] };
  }

  let remaining = total * clamped;

  for (let i = 0; i < steps.length; i++) {
    if (remaining > steps[i]) {
      remaining -= steps[i];
      continue;
    }

    // 이 구간 안에 있다. 남은 만큼을 선분 위에서 비례로 찍는다.
    const t = steps[i] === 0 ? 0 : remaining / steps[i];
    const from = points[i];
    const to = points[i + 1];
    const at = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };

    return {
      walked: [...points.slice(0, i + 1), at],
      ahead: [at, ...points.slice(i + 1)],
      at,
    };
  }

  const last = points[points.length - 1];
  return { walked: [...points], ahead: [last], at: last };
}

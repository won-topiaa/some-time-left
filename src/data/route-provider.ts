/**
 * 경로 공급자.
 *
 * 실제 서비스에서는 네이버/카카오 도보 길찾기 API로 최단 경로를 받고,
 * 경유지를 1~2개 끼워 넣어 길이가 다른 후보들을 만든다.
 * (네이버 지도는 경유지를 5개까지 지원하므로 NP-hard인 정식 최적화 없이도
 *  실용적인 후보 집합을 만들 수 있다 — docs/market-research.md 참고)
 *
 * 여기서는 그 인터페이스만 정의하고, 화면 개발용 mock을 함께 둔다.
 */

import { bearingDeg, distanceM, pathLengthM } from '../domain/geo';
import { routeShadeOverTime } from '../domain/shade';
import type { LatLng, RouteCandidate, RouteFeatures, StreetSegment } from '../domain/types';

export interface RouteRequest {
  origin: LatLng;
  destination: LatLng;
  /** 이 정도 걸리는 경로를 원한다 (초) */
  targetSec: number;
  /** 출발 시각 (epoch ms). 그늘 계산이 시각에 의존한다. */
  departAtMs: number;
}

export interface RouteProvider {
  /** 최단 경로 하나. 시간 예산 계산의 기준점. */
  shortest(origin: LatLng, destination: LatLng): Promise<RouteCandidate>;
  /** 목표 시간 근처의 후보들. 많을수록 좋지만 5~8개면 충분하다. */
  candidates(request: RouteRequest): Promise<RouteCandidate[]>;
}

/** 성인 평균 보행 속도로 거리 → 시간. */
const WALK_SPEED_MPS = 1.25;

export function durationFromDistance(distanceM: number): number {
  return Math.round(distanceM / WALK_SPEED_MPS);
}

/**
 * 좌표열을 그늘 계산이 가능한 구간열로 바꾼다.
 * 건물 높이·도로 폭은 실제로는 건축물대장/도로망 데이터에서 온다.
 * mock에서는 좌표 해시로 그럴듯한 값을 만든다.
 */
export function toSegments(
  path: LatLng[],
  heights: (index: number) => { widthM: number; leftHeightM: number; rightHeightM: number }
): StreetSegment[] {
  const segments: StreetSegment[] = [];
  for (let i = 1; i < path.length; i += 1) {
    const { widthM, leftHeightM, rightHeightM } = heights(i - 1);
    segments.push({
      bearingDeg: bearingDeg(path[i - 1], path[i]),
      lengthM: distanceM(path[i - 1], path[i]),
      widthM,
      leftHeightM,
      rightHeightM,
    });
  }
  return segments;
}

/** 재현 가능한 의사난수. mock이 매번 다른 길을 뱉지 않도록. */
function seeded(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function interpolate(a: LatLng, b: LatLng, t: number): LatLng {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

/**
 * 화면 개발용 mock.
 * 출발-도착 사이에 옆으로 벌어진 경유지를 넣어 길이가 다른 후보를 만든다.
 */
export class MockRouteProvider implements RouteProvider {
  async shortest(origin: LatLng, destination: LatLng): Promise<RouteCandidate> {
    const path = [origin, interpolate(origin, destination, 0.5), destination];
    return this.build('shortest', path, origin, Date.now(), 0.4);
  }

  async candidates({
    origin,
    destination,
    targetSec,
    departAtMs,
  }: RouteRequest): Promise<RouteCandidate[]> {
    const direct = pathLengthM([origin, destination]);
    const targetM = targetSec * WALK_SPEED_MPS;
    // 목표 거리를 내려면 얼마나 옆으로 벌어져야 하는가 (아주 거친 근사)
    const detourScale = Math.max(0, (targetM - direct) / Math.max(direct, 1));

    const out: RouteCandidate[] = [];
    for (let i = 0; i < 6; i += 1) {
      const rand = seeded(i + 1);
      const side = i % 2 === 0 ? 1 : -1;
      const spread = detourScale * (0.5 + rand() * 0.9) * side;

      const mid = interpolate(origin, destination, 0.5);
      const waypoint: LatLng = {
        lat: mid.lat + (destination.lng - origin.lng) * spread * 0.5,
        lng: mid.lng - (destination.lat - origin.lat) * spread * 0.5,
      };

      const path = [
        origin,
        interpolate(origin, waypoint, 0.6),
        waypoint,
        interpolate(waypoint, destination, 0.4),
        destination,
      ];

      out.push(this.build(`mock-${i}`, path, origin, departAtMs, rand()));
    }
    return out;
  }

  private build(
    id: string,
    path: LatLng[],
    origin: LatLng,
    departAtMs: number,
    variance: number
  ): RouteCandidate {
    const rand = seeded(Math.round(variance * 10000) + path.length);
    const segments = toSegments(path, () => ({
      widthM: 8 + rand() * 18,
      leftHeightM: 6 + rand() * 30,
      rightHeightM: 6 + rand() * 30,
    }));

    const distance = pathLengthM(path);
    const durationSec = durationFromDistance(distance);
    const shade = routeShadeOverTime(segments, origin, departAtMs, durationSec);

    const features: RouteFeatures = {
      quiet: rand(),
      flat: rand(),
      shade,
      scenic: rand(),
      novelty: rand(),
      unbroken: rand(),
    };

    return { id, durationSec, distanceM: distance, features, path, segments };
  }
}

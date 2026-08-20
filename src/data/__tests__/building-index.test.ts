import { describe, expect, it } from 'vitest';
import { buildBuildingIndex, buildProfileLookup, profileForSegment } from '../buildings/profile';
import { heightFromFloors, type Building } from '../buildings/types';
import type { LatLng } from '../../domain/types';

/**
 * 격자는 빠르게 만들 뿐, 답을 바꾸면 안 된다.
 *
 * `profileForSegment`는 원래 구간마다 건물 전부를 훑었다. 경로 한 개가 수백 구간이고
 * 건물이 천 개까지 오므로 그게 길 찾는 화면의 멈춤이 됐다. 걸러내기만 하는 최적화이니
 * 무작위 입력에서 전부 훑을 때와 값이 같아야 한다.
 */
function seeded(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function buildings(rand: () => number, n: number, lat: number, lng: number): Building[] {
  return Array.from({ length: n }, () => {
    const floors = 1 + Math.floor(rand() * 20);
    return {
      at: { lat: lat + (rand() - 0.5) * 0.01, lng: lng + (rand() - 0.5) * 0.01 },
      floors,
      heightM: heightFromFloors(floors),
    };
  });
}

describe('건물 격자', () => {
  it('무작위 300구간에서 전부 훑기와 값이 같다', () => {
    const rand = seeded(4242);
    const all = buildings(rand, 600, 37.5665, 126.978);
    const index = buildBuildingIndex(all);

    for (let t = 0; t < 300; t += 1) {
      const from: LatLng = {
        lat: 37.5665 + (rand() - 0.5) * 0.01,
        lng: 126.978 + (rand() - 0.5) * 0.01,
      };
      // 짧은 구간과 긴 구간을 섞는다 — 여유 폭이 구간 길이에 따라 달라진다.
      const span = rand() < 0.5 ? 0.0004 : 0.003;
      const to: LatLng = {
        lat: from.lat + (rand() - 0.5) * span,
        lng: from.lng + (rand() - 0.5) * span,
      };

      expect(profileForSegment(from, to, all, index)).toEqual(
        profileForSegment(from, to, all)
      );
    }
  });

  it('건물이 없으면 격자도 없다', () => {
    expect(buildBuildingIndex([])).toBeNull();
  });

  it('격자를 안 넘기면 예전처럼 전부 훑는다', () => {
    const rand = seeded(7);
    const all = buildings(rand, 50, 37.5665, 126.978);
    const from = { lat: 37.5665, lng: 126.978 };
    const to = { lat: 37.5669, lng: 126.9784 };
    expect(profileForSegment(from, to, all, null)).toEqual(
      profileForSegment(from, to, all)
    );
  });

  it('실제로 건물을 잡아낸다 — 전부 기본값이면 위 비교가 헛돈다', () => {
    const from = { lat: 37.5665, lng: 126.978 };
    const to = { lat: 37.567, lng: 126.978 };
    // 진행 방향(북) 기준 오른쪽(동)에 20m 떨어진 건물
    const east: Building = { at: { lat: 37.56675, lng: 126.97823 }, floors: 12, heightM: 40 };
    const profile = profileForSegment(from, to, [east], buildBuildingIndex([east]));

    expect(profile.rightHeightM).toBeGreaterThan(0);
    expect(profile.leftHeightM).toBe(0);
  });

  it('경로 전체 조회도 같은 값을 준다', () => {
    const rand = seeded(99);
    const all = buildings(rand, 200, 37.5665, 126.978);
    const path: LatLng[] = Array.from({ length: 40 }, (_, i) => ({
      lat: 37.5665 + i * 0.0002,
      lng: 126.978 + i * 0.0001,
    }));

    const lookup = buildProfileLookup(path, all);
    for (let i = 1; i < path.length; i += 1) {
      expect(lookup(i - 1)).toEqual(profileForSegment(path[i - 1], path[i], all));
    }
  });
});

import { describe, expect, it } from 'vitest';
import { pickAlongRoute } from '../tmap/along-route';
import { projectToPath } from '../../domain/geo';
import type { Place } from '../tmap/parse';
import type { LatLng } from '../../domain/types';

// 남 → 북으로 곧게 뻗은 경로 (경도 고정, 위도 증가)
const PATH: LatLng[] = [
  { lat: 37.5000, lng: 127.0 },
  { lat: 37.5050, lng: 127.0 },
  { lat: 37.5100, lng: 127.0 },
];

function place(name: string, at: LatLng, poiId?: string): Place {
  return { name, address: '', at, ...(poiId != null ? { poiId } : {}) };
}

describe('projectToPath', () => {
  it('경로 위의 점은 거리 0, 진행비율은 위치대로', () => {
    const mid = projectToPath(PATH, { lat: 37.5050, lng: 127.0 });
    expect(mid.distanceM).toBeLessThan(1);
    expect(mid.alongRatio).toBeCloseTo(0.5, 1);
  });

  it('옆으로 벗어난 점은 수직 거리로 잰다', () => {
    // 경도 0.0005 ≈ 약 44m 동쪽
    const off = projectToPath(PATH, { lat: 37.5050, lng: 127.0005 });
    expect(off.distanceM).toBeGreaterThan(30);
    expect(off.distanceM).toBeLessThan(60);
    expect(off.alongRatio).toBeCloseTo(0.5, 1);
  });

  it('출발 근처는 진행비율이 낮다', () => {
    expect(projectToPath(PATH, { lat: 37.5005, lng: 127.0 }).alongRatio).toBeLessThan(0.2);
  });
});

describe('pickAlongRoute', () => {
  it('길 곁, 가운데에 있는 가게를 고른다', () => {
    const picked = pickAlongRoute(PATH, [
      place('가운데카페', { lat: 37.5050, lng: 127.0003 }), // 길 곁, 한복판
    ]);
    expect(picked?.name).toBe('가운데카페');
  });

  it('길에서 먼 가게는 고르지 않는다', () => {
    // 경도 0.005 ≈ 약 440m
    const picked = pickAlongRoute(PATH, [place('먼카페', { lat: 37.5050, lng: 127.005 })]);
    expect(picked).toBeNull();
  });

  it('출발·도착 코앞은 우연이 아니라 제외한다', () => {
    const nearStart = pickAlongRoute(PATH, [place('문앞카페', { lat: 37.5002, lng: 127.0002 })]);
    expect(nearStart).toBeNull();
  });

  it('여럿이면 가장 한복판에 가까운 하나', () => {
    const picked = pickAlongRoute(PATH, [
      place('약간위', { lat: 37.5075, lng: 127.0002 }), // alongRatio ~0.75
      place('딱중간', { lat: 37.5050, lng: 127.0002 }), // alongRatio ~0.5
    ]);
    expect(picked?.name).toBe('딱중간');
  });

  it('후보가 없으면 null — 억지로 만들지 않는다', () => {
    expect(pickAlongRoute(PATH, [])).toBeNull();
  });

  it('poiId가 있으면 넘긴다', () => {
    const picked = pickAlongRoute(PATH, [
      place('아이디카페', { lat: 37.5050, lng: 127.0003 }, '12345'),
    ]);
    expect(picked?.poiId).toBe('12345');
  });
});

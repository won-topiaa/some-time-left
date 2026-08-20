import { describe, expect, it } from 'vitest';
import { compactPath, pathLengthM } from '../geo';
import { noveltyOf } from '../../data/features';
import type { LatLng } from '../types';

/** TMAP이 주는 것과 비슷한 촘촘한 도보 경로 (좌표 사이 대략 6~7m). */
function densePath(n: number): LatLng[] {
  const out: LatLng[] = [];
  let lat = 37.5665;
  let lng = 126.978;
  for (let i = 0; i < n; i += 1) {
    // 완만하게 굽는 길
    lat += 0.00006;
    lng += 0.00004 * Math.cos(i / 12);
    out.push({ lat, lng });
  }
  return out;
}

describe('compactPath', () => {
  it('두 점 이하는 그대로 둔다', () => {
    expect(compactPath([])).toEqual([]);
    const one = [{ lat: 37.5, lng: 127 }];
    expect(compactPath(one)).toEqual(one);
    const two = [
      { lat: 37.5, lng: 127 },
      { lat: 37.6, lng: 127 },
    ];
    expect(compactPath(two)).toEqual(two);
  });

  it('처음과 끝은 언제나 남는다', () => {
    const path = densePath(300);
    const compact = compactPath(path);
    expect(compact[0]).toEqual(path[0]);
    expect(compact[compact.length - 1]).toEqual(path[path.length - 1]);
  });

  it('좌표 수를 크게 줄인다', () => {
    const path = densePath(300);
    const compact = compactPath(path);
    expect(compact.length).toBeLessThan(path.length / 2);
    expect(compact.length).toBeGreaterThan(2);
  });

  it('남긴 좌표 사이가 60m 판정 반경보다 촘촘하다', () => {
    // 이보다 벌어지면 '가본 길'을 새 길로 잘못 보게 된다.
    const compact = compactPath(densePath(300));
    for (let i = 1; i < compact.length; i += 1) {
      expect(pathLengthM([compact[i - 1], compact[i]])).toBeLessThan(60);
    }
  });

  it('길이가 거의 그대로다 — 리본 모양이 뭉개지지 않는다', () => {
    const path = densePath(300);
    const before = pathLengthM(path);
    const after = pathLengthM(compactPath(path));
    expect(after / before).toBeGreaterThan(0.97);
    expect(after / before).toBeLessThanOrEqual(1);
  });

  it('솎아도 "가본 길" 판정이 뒤집히지 않는다', () => {
    const walked = densePath(300);
    const compact = compactPath(walked);
    // 같은 길을 다시 걸으면, 원본으로 재든 솎은 것으로 재든 새로울 게 없다.
    expect(noveltyOf(walked, [walked])).toBe(0);
    expect(noveltyOf(walked, [compact])).toBe(0);
  });

  it('간격을 직접 줄 수 있다', () => {
    const path = densePath(200);
    const loose = compactPath(path, 100);
    const tight = compactPath(path, 10);
    expect(loose.length).toBeLessThan(tight.length);
  });
});

import { describe, expect, it } from 'vitest';
import { buildVisitedIndex, noveltyOf } from '../features';
import { distanceM } from '../../domain/geo';
import type { LatLng } from '../../domain/types';

/**
 * 격자는 답을 바꾸면 안 된다.
 *
 * `noveltyOf`는 원래 지나온 좌표를 전부 하나씩 재는 무차별 대입이었다. 기록이 쌓이면
 * 그게 몇 초짜리 멈춤이 되어 60m 격자로 미리 걸러내게 바꿨는데, 이건 **빠르게 만드는
 * 최적화일 뿐 판정을 바꾸는 변경이 아니어야 한다.** 그래서 옛 구현을 여기 남겨 두고
 * 무작위 입력으로 두 결과가 늘 같은지 확인한다.
 */
const VISITED_RADIUS_M = 60;

function bruteForceNovelty(path: LatLng[], previousPaths: LatLng[][]): number {
  if (path.length === 0) return 1;
  const visited = previousPaths.flat();
  if (visited.length === 0) return 1;
  let fresh = 0;
  for (const p of path) {
    if (!visited.some((q) => distanceM(p, q) <= VISITED_RADIUS_M)) fresh += 1;
  }
  return Math.min(1, Math.max(0, fresh / path.length));
}

/** 재현 가능한 난수. 테스트가 실행마다 다른 걸 보면 안 된다. */
function seeded(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function randomWalk(rand: () => number, lat: number, lng: number, n: number): LatLng[] {
  const out: LatLng[] = [];
  let [la, ln] = [lat, lng];
  for (let i = 0; i < n; i += 1) {
    la += (rand() - 0.5) * 0.0009;
    ln += (rand() - 0.5) * 0.0009;
    out.push({ lat: la, lng: ln });
  }
  return out;
}

describe('noveltyOf — 격자와 무차별 대입', () => {
  it('무작위 200회에서 값이 완전히 같다', () => {
    const rand = seeded(20260820);

    for (let trial = 0; trial < 200; trial += 1) {
      const previousPaths = Array.from({ length: 1 + Math.floor(rand() * 5) }, () =>
        randomWalk(rand, 37.55 + rand() * 0.05, 126.95 + rand() * 0.05, 20 + Math.floor(rand() * 50))
      );

      // 절반은 지나온 길 위에서 출발시켜 실제로 겹치게 만든다.
      // 안 겹치기만 하면 둘 다 1이라 비교가 무의미해진다.
      const seed =
        rand() < 0.5
          ? previousPaths[0][0]
          : { lat: 37.55 + rand() * 0.05, lng: 126.95 + rand() * 0.05 };
      const candidate = randomWalk(rand, seed.lat, seed.lng, 30 + Math.floor(rand() * 60));

      expect(noveltyOf(candidate, previousPaths)).toBe(
        bruteForceNovelty(candidate, previousPaths)
      );
    }
  });

  it('겹치는 경우를 실제로 만들어 낸다 — 전부 1이면 위 비교가 헛돈다', () => {
    const rand = seeded(7);
    const previous = [randomWalk(rand, 37.5665, 126.978, 40)];
    // 지나온 길을 그대로 다시 걸으면 새로울 것이 없다.
    expect(noveltyOf(previous[0], previous)).toBe(0);
  });

  it('멀리 떨어진 길은 통째로 새 길이다', () => {
    const rand = seeded(11);
    const previous = [randomWalk(rand, 37.5665, 126.978, 40)];
    const far = randomWalk(rand, 37.7, 127.1, 40);
    expect(noveltyOf(far, previous)).toBe(1);
  });

  it('기록이 없으면 새 길로 본다', () => {
    expect(noveltyOf([{ lat: 37.5, lng: 127 }], [])).toBe(1);
    expect(noveltyOf([], [[{ lat: 37.5, lng: 127 }]])).toBe(1);
  });

  it('미리 만든 격자를 넘겨도 같은 값이 나온다', () => {
    const rand = seeded(99);
    const previous = [randomWalk(rand, 37.5665, 126.978, 60)];
    const candidate = randomWalk(rand, 37.5665, 126.978, 40);
    const index = buildVisitedIndex(previous);

    expect(noveltyOf(candidate, previous, index)).toBe(noveltyOf(candidate, previous));
  });

  it('빈 기록으로 만든 격자는 null이고, 그 경우 새 길로 본다', () => {
    expect(buildVisitedIndex([])).toBeNull();
    expect(noveltyOf([{ lat: 37.5, lng: 127 }], [], null)).toBe(1);
  });
});

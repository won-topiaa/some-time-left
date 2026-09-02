import { describe, expect, it } from 'vitest';
import { MockRouteProvider } from '../route-provider';
import { distanceM, pathLengthM } from '../../domain/geo';
import { arrivesOnTime, landsOnTarget, nextRoute, rankRoutes } from '../../domain/route-plan';
import { planWalk } from '../../domain/time';
import { weightsFor } from '../../domain/mood';

/**
 * 키 없는 번들은 이 공급자로 돈다 — 심사용 번들이 그렇다. 그러니 이게 곧 앱이
 * 길을 늘리는 모습이고, 여기서 못 늘리면 "5분 전에 닿는 길"을 보여줄 방법이 없다.
 *
 * 예전 mock은 위경도 차이에 비례한 대충의 값으로 옆으로 벌렸는데, 경도 1도는
 * 위도 1도의 0.8배라 남북으로 난 길에서는 거의 못 벌어졌다. 목표 40분에 후보
 * 여섯이 전부 21분이었고, 게다가 씨앗 1·2·3의 첫 난수가 전부 0 언저리라 여섯이
 * **똑같았다.** 다른 길 버튼이 늘 같은 길을 보여줬다.
 */
describe('MockRouteProvider', () => {
  const provider = new MockRouteProvider();
  const MIN = 60;
  const now = Date.UTC(2026, 8, 2, 5, 0); // 2026-09-02 14:00 KST

  // 시청 → 경복궁 근처. 거의 정북으로 1.45km — 예전 mock이 가장 못 벌리던 방향.
  const origin = { lat: 37.5665, lng: 126.978 };
  const northward = { lat: 37.5796, lng: 126.977 };
  // 동서로 난 길도 같이 본다.
  const eastward = { lat: 37.5665, lng: 126.995 };

  for (const [name, destination] of [
    ['남북', northward],
    ['동서', eastward],
  ] as const) {
    it(`${name}으로 난 길에서 후보가 목표 언저리로 흩어진다`, async () => {
      const shortest = await provider.shortest(origin, destination);
      const plan = planWalk({
        nowMs: now,
        arriveAtMs: now + 45 * MIN * 1000,
        shortestSec: shortest.durationSec,
      });
      if (plan.kind !== 'stretch') throw new Error('늘리는 계획이어야 한다');

      const candidates = await provider.candidates({
        origin,
        destination,
        targetSec: plan.targetWalkSec,
        departAtMs: now,
      });

      expect(candidates).toHaveLength(6);
      const durations = candidates.map((c) => c.durationSec);
      // 여섯이 똑같지 않다.
      expect(new Set(durations.map((d) => Math.round(d / 30))).size).toBeGreaterThan(2);
      // 목표의 ±25% 안에 다 들어온다 — 최단(19분)에 붙어 있지 않다.
      for (const d of durations) {
        expect(d).toBeGreaterThan(plan.targetWalkSec * 0.75);
        expect(d).toBeLessThan(plan.targetWalkSec * 1.25);
      }
      // 제때 닿는 것이 적어도 하나 있고, 그중 맞췄다고 말할 수 있는 것도 있다.
      const ranked = rankRoutes(candidates, {
        targetSec: plan.targetWalkSec,
        weights: weightsFor('plain'),
      });
      const first = nextRoute(ranked, [], plan.targetWalkSec);
      expect(first).not.toBeNull();
      expect(landsOnTarget(first!.candidate.durationSec, plan.targetWalkSec)).toBe(true);
    });
  }

  it('다른 길을 끝까지 눌러도 늦는 길은 나오지 않는다', async () => {
    const target = 40 * MIN;
    const candidates = await provider.candidates({
      origin,
      destination: northward,
      targetSec: target,
      departAtMs: now,
    });
    const ranked = rankRoutes(candidates, { targetSec: target, weights: weightsFor('excited') });

    const shown: string[] = [];
    let current = nextRoute(ranked, shown, target);
    while (current != null) {
      expect(arrivesOnTime(current.candidate.durationSec, target)).toBe(true);
      shown.push(current.candidate.id);
      current = nextRoute(ranked, shown, target);
    }
    expect(shown.length).toBeGreaterThan(1);
  });

  it('경로마다 점이 다섯이고 길이가 소요 시간과 맞는다', async () => {
    const candidates = await provider.candidates({
      origin,
      destination: northward,
      targetSec: 30 * MIN,
      departAtMs: now,
    });
    for (const c of candidates) {
      expect(c.path).toHaveLength(5);
      expect(c.path[0]).toEqual(origin);
      expect(c.path[4]).toEqual(northward);
      expect(c.distanceM).toBeCloseTo(pathLengthM(c.path), 6);
      expect(c.durationSec).toBe(Math.round(c.distanceM / 1.25));
    }
  });

  it('출발과 도착이 같으면 목표 길이만큼 나갔다 돌아오는 길이 된다', async () => {
    const candidates = await provider.candidates({
      origin,
      destination: origin,
      targetSec: 10 * MIN,
      departAtMs: now,
    });
    for (const c of candidates) {
      expect(Number.isFinite(c.durationSec)).toBe(true);
      expect(c.distanceM).toBeGreaterThan(0);
      expect(distanceM(c.path[0], c.path[4])).toBe(0);
    }
  });

  it('목표가 0이면 곧장 가는 길이다', async () => {
    const candidates = await provider.candidates({
      origin,
      destination: northward,
      targetSec: 0,
      departAtMs: now,
    });
    const direct = distanceM(origin, northward);
    for (const c of candidates) {
      expect(c.distanceM).toBeCloseTo(direct, 0);
    }
  });
});

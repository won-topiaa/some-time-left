import { describe, expect, it } from 'vitest';
import { OsrmRouteProvider } from '../osrm-route-provider';
import { inspectPath } from '../../domain/route-sanity';
import { arrivesOnTime, landsOnTarget, rankRoutes, nextRoute } from '../../domain/route-plan';
import { weightsFor } from '../../domain/mood';
import { ARRIVE_EARLY_SEC, planWalk } from '../../domain/time';

/**
 * 실제 FOSSGIS OSRM을 때린다. 기본 테스트 실행에는 안 들어간다(.integration.ts).
 *   npx vitest run --config vitest.integration.config.ts
 * 또는 직접: npx vitest run src/data/__tests__/osrm-live.integration.ts
 */
describe('OSRM 실통신', () => {
  const provider = new OsrmRouteProvider();
  const MIN = 60;
  const now = Date.UTC(2026, 8, 3, 4, 0);

  // 사용자가 삼각형을 본 바로 그 동네. 산이 있어 길이 굽는 곳이다.
  const origin = { lat: 37.5052, lng: 126.9575 };
  const destination = { lat: 37.5087, lng: 126.9637 };

  it('최단 경로가 실제 도로 모양으로 온다', async () => {
    const shortest = await provider.shortest(origin, destination);
    const sanity = inspectPath(shortest.path);

    console.log(
      `최단: ${Math.round(shortest.distanceM)}m / ${(shortest.durationSec / 60).toFixed(1)}분 / ` +
        `정점 ${shortest.path.length} / 검사대상 ${sanity.testable} / 공선 ${sanity.collinear}`
    );

    expect(sanity.ok).toBe(true);
    expect(shortest.path.length).toBeGreaterThan(20);
  }, 60000);

  it('목표 시간에 맞는 후보가 실제로 채택된다 — 보정 라운드까지 포함해서', async () => {
    const shortest = await provider.shortest(origin, destination);
    const plan = planWalk({
      nowMs: now,
      arriveAtMs: now + 30 * MIN * 1000,
      shortestSec: shortest.durationSec,
      earlySec: ARRIVE_EARLY_SEC,
    });
    if (plan.kind !== 'stretch') throw new Error(`늘리는 계획이어야 한다 (${plan.kind})`);

    const candidates = await provider.candidates({
      origin,
      destination,
      targetSec: plan.targetWalkSec,
      departAtMs: now,
    });

    console.log(`목표 ${(plan.targetWalkSec / 60).toFixed(1)}분 / 후보 ${candidates.length}개`);
    for (const c of candidates) {
      const s = inspectPath(c.path);
      console.log(
        `  ${(c.durationSec / 60).toFixed(1)}분 ${Math.round(c.distanceM)}m ` +
          `정점${c.path.length} 공선${s.collinear}/${s.testable} ` +
          `${arrivesOnTime(c.durationSec, plan.targetWalkSec) ? '채택가능' : '초과'}`
      );
    }

    expect(candidates.length).toBeGreaterThan(0);
    // 전부 실제 도로 모양이어야 한다.
    for (const c of candidates) {
      expect(inspectPath(c.path).ok).toBe(true);
    }

    // 그리고 실제로 내놓을 수 있는 것이 있어야 한다 — 이게 앱의 간판 기능이다.
    const ranked = rankRoutes(candidates, {
      targetSec: plan.targetWalkSec,
      weights: weightsFor('plain'),
    });
    const picked = nextRoute(ranked, [], plan.targetWalkSec);
    console.log(
      picked
        ? `채택: ${(picked.candidate.durationSec / 60).toFixed(1)}분 (목표에 맞음=${landsOnTarget(picked.candidate.durationSec, plan.targetWalkSec)})`
        : '채택된 후보 없음 → 최단으로 물러섬'
    );
    expect(picked).not.toBeNull();
  }, 120000);
});

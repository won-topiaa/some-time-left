import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 환경 데이터는 바깥 API 셋을 때린다. 몇 번 부르는지가 곧 기다리는 시간이다. */
const loadEnvironment = vi.fn();
vi.mock('../environment', () => ({
  EMPTY_ENVIRONMENT: { congestion: [], parks: [], buildings: [] },
  loadEnvironment: (...args: unknown[]) => loadEnvironment(...args),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RoadRouteProvider } from '../road-route-provider';
import { DEFAULT_WALK_SPEED_MPS } from '../../domain/pace';
import { distanceM } from '../../domain/geo';
import type { ParsedRoute } from '../tmap/parse';
import type { LatLng } from '../../domain/types';

const origin = { lat: 37.5052, lng: 126.9575 };
const destination = { lat: 37.5087, lng: 126.9637 };

/** 실제 도로처럼 조금씩 굽은 좌표열. 관문(직선 검사)을 지나야 후보로 선다. */
function road(seed: number): LatLng[] {
  const points: LatLng[] = [];
  for (let i = 0; i <= 10; i += 1) {
    const t = i / 10;
    points.push({
      lat: origin.lat + (destination.lat - origin.lat) * t + Math.sin(t * 6 + seed) * 0.0009,
      lng: origin.lng + (destination.lng - origin.lng) * t + Math.cos(t * 5 + seed) * 0.0011,
    });
  }
  return points;
}

/** 무엇이 먼저 시작됐는지. 환경 데이터가 후보보다 먼저 떠야 겹쳐서 받는다. */
const started: string[] = [];

/** 요청마다 durationSec을 지정해 보정 라운드를 켜고 끌 수 있게 한다. */
function provider(durationSec: number) {
  const calls: Array<{ timeoutMs?: number; waypoints?: LatLng[] }> = [];
  let seed = 0;
  const instance = new RoadRouteProvider({
    idPrefix: 'test',
    fetchRoute: async (query) => {
      started.push('길');
      calls.push({ timeoutMs: query.timeoutMs, waypoints: query.waypoints });
      seed += 1;
      const parsed: ParsedRoute = {
        path: road(seed),
        distanceM: 1800,
        durationSec,
        crossings: null,
        stairs: null,
      };
      return parsed;
    },
  });
  return { instance, calls };
}

const request = (targetSec: number) => ({
  origin,
  destination,
  targetSec,
  departAtMs: 0,
});

describe('길 찾기에 드는 값', () => {
  beforeEach(() => {
    started.length = 0;
    loadEnvironment.mockReset();
    loadEnvironment.mockImplementation(async () => {
      started.push('환경');
      return { congestion: [], parks: [], buildings: [] };
    });
  });

  /*
   * 환경 데이터(혼잡도·공원·건물)는 라운드 안에 있었다. 보정까지 가는 날이면
   * 같은 동네를 두 벌 받았고, 그 한 벌이 통째로 기다리는 시간에 얹혔다.
   */
  it('보정 라운드까지 가도 환경 데이터는 한 번만 받는다', async () => {
    // 목표 25분인데 후보가 전부 10분 → 문턱(120초)을 크게 벗어나 보정이 돈다.
    const { instance, calls } = provider(600);
    const routes = await instance.candidates(request(25 * 60));

    expect(routes.length).toBeGreaterThan(6); // 두 라운드가 실제로 돌았다
    expect(loadEnvironment).toHaveBeenCalledTimes(1);
    expect(calls.length).toBe(10); // 첫 라운드 6 + 보정 4
  });

  /*
   * **기다리는 시간의 맨 끝에 얹히지 않는다.**
   *
   * 예전엔 후보를 다 받은 뒤에 환경 데이터를 불렀다. 순위를 다듬는 값 하나가
   * 길 찾기 끝에 통째로 붙어서, 출처마다 1.5초에 바깥 시한까지 최대 2초가
   * 더 걸렸다. 실제 후보 좌표가 아직 없어도 경유지는 지금 알 수 있으므로,
   * 그 근처를 미리 받아 두고 후보를 받는 동안 같이 기다린다.
   */
  it('후보를 받기 전에 환경 데이터를 먼저 띄운다', async () => {
    const { instance } = provider(25 * 60);
    await instance.candidates(request(25 * 60));

    expect(started[0]).toBe('환경');
  });

  it('미리 받을 자리를 촘촘히 찍는다', async () => {
    /*
     * 혼잡도는 서울 장소 121곳 중 경로 **근처에 있는 것**을 골라 묻는다.
     * 꼭짓점만 찍으면 사이에 있는 동네가 통째로 빠져 중립값이 된다.
     */
    const { instance } = provider(25 * 60);
    await instance.candidates(request(25 * 60));

    const passed = loadEnvironment.mock.calls[0][0] as LatLng[][];
    expect(passed).toHaveLength(1);
    expect(passed[0].length).toBeGreaterThan(50);
  });

  it('첫 라운드가 목표에 맞으면 보정을 아예 안 돈다', async () => {
    const { instance, calls } = provider(25 * 60);
    const routes = await instance.candidates(request(25 * 60));

    expect(calls.length).toBe(6);
    expect(routes).toHaveLength(6);
    expect(loadEnvironment).toHaveBeenCalledTimes(1);
  });

  /*
   * 후보는 여럿 띄워 되는 것만 쓴다. 하나가 응답을 안 주면 나머지가 이미 와 있어도
   * 라운드 전체가 그 하나를 기다렸다 — 기본 타임아웃이 7초다.
   */
  it('후보 요청에는 짧은 시한을 건다', async () => {
    const { instance, calls } = provider(25 * 60);
    await instance.candidates(request(25 * 60));

    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.timeoutMs).toBeDefined();
      expect(call.timeoutMs).toBeLessThan(7000);
    }
  });

  it('최단 경로에는 시한을 걸지 않는다 — 없으면 아무것도 못 한다', async () => {
    const { instance, calls } = provider(25 * 60);
    await instance.shortest(origin, destination);

    expect(calls).toHaveLength(1);
    expect(calls[0].timeoutMs).toBeUndefined();
    // 최단은 시간 예산의 기준점이라 환경 데이터를 부르지 않는다.
    expect(loadEnvironment).not.toHaveBeenCalled();
  });

  /*
   * 혼잡도·공원·건물은 순위를 다듬는 값이지 길이 아니다. 하나가 느리다고
   * 길을 기다리는 화면이 같이 서 있으면 안 된다.
   */
  it('환경 데이터가 늦으면 기다리지 않고 중립값으로 간다', async () => {
    loadEnvironment.mockImplementation(
      () => new Promise(() => {}) // 영영 안 온다
    );
    const { instance } = provider(25 * 60);

    const routes = await instance.candidates(request(25 * 60));
    expect(routes).toHaveLength(6);
    // 중립값으로도 후보는 성질을 갖는다 — 화면이 순위를 매길 수 있다.
    expect(routes[0].features).toBeDefined();
  }, 10_000);

  it('환경 데이터가 실패해도 후보는 나온다', async () => {
    loadEnvironment.mockRejectedValue(new Error('브이월드가 죽었다'));
    const { instance } = provider(25 * 60);

    await expect(instance.candidates(request(25 * 60))).resolves.toHaveLength(6);
  });
});

/**
 * 보정 라운드가 **어디서 출발하는가.**
 *
 * 1라운드는 배율을 넓게 훑는다(`WIDE_SPREAD`). 그러니 가장 가까웠던 후보는
 * 배율 0.5에서 나왔을 수도, 1.9에서 나왔을 수도 있다. 그걸 `1`로 두고 보정하면
 * 엉뚱한 자리에서 출발해서, 두 라운드를 돌고도 목표를 못 맞춘다.
 *
 * 도로망을 흉내 내되 **단조**로 둔다 — 경유지를 멀리 밀면 오래 걸린다. 실제
 * 도로망은 비단조라서 이 테스트보다 어렵고, 그래서 폭을 넓게 훑는 것이다.
 */
describe('보정 라운드의 출발점', () => {
  beforeEach(() => {
    loadEnvironment.mockReset();
    loadEnvironment.mockResolvedValue({ congestion: [], parks: [], buildings: [] });
  });

  /** 경유지를 지나는 삼각형 길이를 그대로 소요 시간으로 돌려준다. */
  function geometricProvider() {
    let seed = 0;
    return new RoadRouteProvider({
      idPrefix: 'geo',
      fetchRoute: async ({ waypoints }) => {
        seed += 1;
        const via = waypoints?.[0];
        const lengthM =
          via == null
            ? distanceM(origin, destination)
            : distanceM(origin, via) + distanceM(via, destination);
        const parsed: ParsedRoute = {
          path: road(seed),
          distanceM: lengthM,
          durationSec: lengthM / DEFAULT_WALK_SPEED_MPS,
          crossings: null,
          stairs: null,
        };
        return parsed;
      },
    });
  }

  it('두 라운드를 돌면 목표 언저리에 닿는다', async () => {
    const targetSec = 30 * 60;
    const routes = await geometricProvider().candidates(request(targetSec));

    expect(routes.length).toBeGreaterThan(0);
    const closest = Math.min(...routes.map((r) => Math.abs(r.durationSec - targetSec)));
    // 목표의 5% 안. 배율 1에서 보정을 시작하면 이 안에 못 들어온다.
    expect(closest).toBeLessThan(targetSec * 0.05);
  });

  it('후보가 목표를 양쪽에서 감싼다', async () => {
    const targetSec = 30 * 60;
    const routes = await geometricProvider().candidates(request(targetSec));
    const durations = routes.map((r) => r.durationSec);

    // 한쪽으로만 몰리면 관문에서 통째로 걸러지거나 통째로 통과한다.
    expect(Math.min(...durations)).toBeLessThan(targetSec);
    expect(Math.max(...durations)).toBeGreaterThan(targetSec);
  });
});

/**
 * 보정의 출발점은 소스에 못으로 박는다.
 *
 * 동작으로 잡으려면 1라운드가 목표를 못 맞히는 도로망이 필요하다. 그런데 폭을
 * 넓게 훑도록 고친 뒤로는 흉내 낸 도로망에서 1라운드가 거의 맞혀 버려서,
 * 보정 라운드 자체가 돌지 않는다 — 잡고 싶은 코드가 실행되지 않는다.
 * 실제 도로망(비단조)에서만 갈리는 차이라 여기서는 약속만 지킨다.
 */
describe('보정은 가장 가까웠던 후보의 배율에서 출발한다', () => {
  const source = readFileSync(join(__dirname, '..', 'road-route-provider.ts'), 'utf8');

  it('refineScale에 그 후보의 배율을 넘긴다', () => {
    const call = source.slice(
      source.indexOf('refineScale('),
      source.indexOf(';', source.indexOf('refineScale('))
    );

    // 1을 넘기면, 배율 0.5에서 나온 최선을 1에서 나온 것으로 치고 보정한다.
    expect(call).toContain('magnitude');
    expect(call).not.toMatch(/,\s*1\s*\)/);
  });

  it('받아 온 길마다 그 배율을 같이 들고 나간다', () => {
    // 성공한 것만 남기면서 순서(=배율)를 잃으면 위 약속을 지킬 수 없다.
    expect(source).toContain('waypointMagnitude(index, count, spread)');
  });
});

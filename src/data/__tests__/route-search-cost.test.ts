import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 환경 데이터는 바깥 API 셋을 때린다. 몇 번 부르는지가 곧 기다리는 시간이다. */
const loadEnvironment = vi.fn();
vi.mock('../environment', () => ({
  EMPTY_ENVIRONMENT: { congestion: [], parks: [], buildings: [] },
  loadEnvironment: (...args: unknown[]) => loadEnvironment(...args),
}));

import { RoadRouteProvider } from '../road-route-provider';
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

/** 요청마다 durationSec을 지정해 보정 라운드를 켜고 끌 수 있게 한다. */
function provider(durationSec: number) {
  const calls: Array<{ timeoutMs?: number; waypoints?: LatLng[] }> = [];
  let seed = 0;
  const instance = new RoadRouteProvider({
    idPrefix: 'test',
    fetchRoute: async (query) => {
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
    loadEnvironment.mockReset();
    loadEnvironment.mockResolvedValue({ congestion: [], parks: [], buildings: [] });
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
    // 한 번 부를 때 두 라운드의 좌표를 다 넘긴다 — 나중에 받는 대신 모아서 받는다.
    expect(loadEnvironment.mock.calls[0][0]).toHaveLength(routes.length);
    expect(calls.length).toBe(10); // 첫 라운드 6 + 보정 4
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

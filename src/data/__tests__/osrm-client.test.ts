import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fetchOsrmRoute } from '../osrm/client';

/**
 * 키 없는 번들이 여기로 온다. 그러니 이 파일이 곧 심사용 번들의 경로 품질이다.
 *
 * 특히 조심할 것 하나: OSRM은 **닿을 수 없는 좌표에도 에러를 주지 않는다.**
 * 실측으로 확인했다 — 남해 바다 한가운데 두 점을 넣었더니 `code: "Ok"`와
 * 15.4m짜리 '경로'를 돌려줬다. 두 점을 각각 28km, 35km 떨어진 육지 도로로
 * 말없이 끌어다 붙인 것이다. 그 응답을 그대로 믿으면 사용자가 있지도 않은 곳에서
 * 출발하는 길을 받는다.
 */

const origin = { lat: 37.5665, lng: 126.978 };
const destination = { lat: 37.5796, lng: 126.977 };

let calls: Array<{ url: string; init: RequestInit }> = [];
let reply: unknown = {};

const realFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return {
      ok: true,
      status: 200,
      json: async () => reply,
    };
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

/** 도로를 따라간 좌표열처럼 보이는 응답. 정점이 촘촘하다. */
function roadLikeResponse(snapDistances: number[] = [6.6, 6.1]) {
  const coordinates: [number, number][] = [];
  for (let i = 0; i <= 60; i += 1) {
    const t = i / 60;
    coordinates.push([
      126.978 + (126.977 - 126.978) * t,
      // 조금씩 흔들리게 둔다 — 완전한 직선은 도로가 아니다.
      37.5665 + (37.5796 - 37.5665) * t + Math.sin(i) * 0.00004,
    ]);
  }
  return {
    code: 'Ok',
    routes: [{ distance: 1730, duration: 1384, geometry: { coordinates } }],
    waypoints: snapDistances.map((distance) => ({ distance })),
  };
}

describe('fetchOsrmRoute', () => {
  it('보행 프로파일을 경도,위도 순서로 부른다', async () => {
    reply = roadLikeResponse();

    await fetchOsrmRoute({ origin, destination });

    expect(calls).toHaveLength(1);
    // 위경도를 뒤집으면 지구 반대편으로 간다. 순서를 못 박아 둔다.
    expect(calls[0].url).toContain('/routed-foot/route/v1/foot/126.978000,37.566500;126.977000,37.579600');
    // overview=full이 아니면 좌표가 확 줄어 실제 길 모양을 잃는다(실측 264점 → 22점).
    expect(calls[0].url).toContain('overview=full');
  });

  it('User-Agent를 밝힌다 — 없으면 403으로 거절당한다', async () => {
    reply = roadLikeResponse();

    await fetchOsrmRoute({ origin, destination });

    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers['User-Agent']).toBeTruthy();
  });

  it('경유지를 출발과 도착 사이에 넣는다 — 이게 길을 늘리는 방법이다', async () => {
    reply = roadLikeResponse([6.6, 8.2, 6.1]);

    await fetchOsrmRoute({
      origin,
      destination,
      waypoints: [{ lat: 37.573, lng: 126.97 }],
    });

    expect(calls[0].url).toContain('126.978000,37.566500;126.970000,37.573000;126.977000,37.579600');
  });

  it('좌표를 위경도로 바로 세워 돌려준다', async () => {
    reply = roadLikeResponse();

    const parsed = await fetchOsrmRoute({ origin, destination });

    expect(parsed.path[0].lat).toBeCloseTo(37.5665, 3);
    expect(parsed.path[0].lng).toBeCloseTo(126.978, 3);
    expect(parsed.distanceM).toBe(1730);
    expect(parsed.durationSec).toBe(1384);
  });

  it('횡단보도·계단은 모른다고 둔다 — 0으로 적으면 거짓말이 된다', async () => {
    reply = roadLikeResponse();

    const parsed = await fetchOsrmRoute({ origin, destination });

    // 0이면 "횡단보도가 하나도 없는 길"이 되어 랭킹이 그 길을 띄운다.
    expect(parsed.crossings).toBeNull();
    expect(parsed.stairs).toBeNull();
  });

  it('멀리 끌어다 붙인 응답은 거절한다 — 바다 좌표가 "Ok"로 오던 구멍', async () => {
    // 실측한 바다 응답 그대로: code는 Ok인데 좌표를 28km, 35km 밖에서 주워 왔다.
    reply = {
      code: 'Ok',
      routes: [
        {
          distance: 15.4,
          duration: 12.3,
          geometry: {
            coordinates: [
              [128.5, 33.0],
              [128.5001, 33.0001],
            ] as [number, number][],
          },
        },
      ],
      waypoints: [{ distance: 28485.9 }, { distance: 35570.9 }],
    };

    await expect(fetchOsrmRoute({ origin, destination })).rejects.toThrow();
  });

  it('waypoints가 없어도 엉뚱한 자리에서 시작하면 거절한다', async () => {
    /*
     * `waypoints`는 서버가 넣어 줄 때만 있다. `skip_waypoints`를 켠 인스턴스나
     * 중간에 끼는 프록시가 벗겨 내면 위의 snap 검사가 한 번도 안 돌아, 28km 밖에서
     * 주워 온 좌표가 그대로 통과했다. 서버가 자진해서 알려 주는 값에 안전을
     * 걸어 두지 않는다 — 시작·끝 좌표는 언제나 있으므로 우리가 직접 잰다.
     */
    reply = {
      code: 'Ok',
      routes: [
        {
          distance: 15.4,
          duration: 12.3,
          geometry: {
            // 물어본 곳은 서울인데 남해에서 시작한다.
            coordinates: [
              [128.5, 33.0],
              [128.5001, 33.0001],
            ] as [number, number][],
          },
        },
      ],
      // waypoints가 통째로 없다 — 그래도 걸러야 한다.
    };

    await expect(fetchOsrmRoute({ origin, destination })).rejects.toThrow();
  });

  it('도로망에 안 붙는 경유지는 거절로 받는다', async () => {
    reply = { code: 'NoSegment' };

    await expect(fetchOsrmRoute({ origin, destination })).rejects.toThrow();
  });

  it('점 하나짜리 응답은 길이 아니다', async () => {
    reply = {
      code: 'Ok',
      routes: [
        { distance: 0, duration: 0, geometry: { coordinates: [[126.978, 37.5665]] } },
      ],
      waypoints: [{ distance: 5 }, { distance: 5 }],
    };

    await expect(fetchOsrmRoute({ origin, destination })).rejects.toThrow();
  });
});

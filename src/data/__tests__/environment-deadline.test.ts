import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchCongestionAlong = vi.fn();
const fetchParks = vi.fn();
const fetchBuildings = vi.fn();

vi.mock('../seoul/congestion', () => ({
  fetchCongestionAlong: (...a: unknown[]) => fetchCongestionAlong(...a),
}));
vi.mock('../parks/client', () => ({ fetchParks: (...a: unknown[]) => fetchParks(...a) }));
vi.mock('../parks/scenic', () => ({ parksNear: (all: unknown[]) => all }));
vi.mock('../buildings/vworld', () => ({
  fetchBuildings: (...a: unknown[]) => fetchBuildings(...a),
}));

import { clearParkCache, loadEnvironment } from '../environment';

const path = [
  { lat: 37.5, lng: 127 },
  { lat: 37.51, lng: 127.01 },
];
const never = () => new Promise(() => {});

describe('환경 데이터의 시한', () => {
  beforeEach(() => {
    // 공원 목록은 세션 동안 한 번만 받는다(모듈 캐시). 안 비우면 앞 테스트가
    // 채워 둔 값이 다음 테스트의 모의를 이긴다.
    clearParkCache();
    fetchCongestionAlong.mockReset().mockResolvedValue([{ areaName: '상도동' }]);
    fetchParks.mockReset().mockResolvedValue([{ name: '한강공원' }]);
    fetchBuildings.mockReset().mockResolvedValue([{ floors: 5 }]);
  });

  it('셋 다 제때 오면 셋 다 쓴다', async () => {
    const env = await loadEnvironment([path], '서울특별시', 500);
    expect(env.congestion).toHaveLength(1);
    expect(env.parks).toHaveLength(1);
    expect(env.buildings).toHaveLength(1);
  });

  /*
   * 시한을 셋에 묶어 밖에서 한 번에 끊었더니, 하나가 늦으면 이미 도착한 둘까지
   * 같이 버려졌다 — 건물 천 채가 느리다고 혼잡도와 공원까지 중립값이 됐다.
   */
  it('하나가 늦어도 이미 온 나머지는 살아 온다', async () => {
    fetchBuildings.mockImplementation(never);

    const env = await loadEnvironment([path], '서울특별시', 120);
    expect(env.buildings).toEqual([]); // 늦은 것만 빠지고
    expect(env.congestion).toHaveLength(1); // 나머지는 그대로다
    expect(env.parks).toHaveLength(1);
  });

  it('셋 다 늦으면 중립값으로 간다 — 길을 기다리게 두지 않는다', async () => {
    fetchCongestionAlong.mockImplementation(never);
    fetchParks.mockImplementation(never);
    fetchBuildings.mockImplementation(never);

    const env = await loadEnvironment([path], '서울특별시', 120);
    expect(env).toEqual({ congestion: [], parks: [], buildings: [] });
  });

  it('하나가 실패해도 나머지는 쓴다', async () => {
    fetchParks.mockRejectedValue(new Error('공공데이터포털이 죽었다'));
    const env = await loadEnvironment([path], '서울특별시', 500);
    expect(env.parks).toEqual([]);
    expect(env.congestion).toHaveLength(1);
    expect(env.buildings).toHaveLength(1);
  });

  it('시한을 안 주면 요청이 끝날 때까지 기다린다 — 예전 동작 그대로', async () => {
    let resolveLate: (v: unknown) => void = () => {};
    fetchBuildings.mockImplementation(() => new Promise((r) => { resolveLate = r; }));

    const pending = loadEnvironment([path]);
    resolveLate([{ floors: 9 }]);
    await expect(pending).resolves.toMatchObject({ buildings: [{ floors: 9 }] });
  });

  it('좌표가 없으면 아무 데도 안 부른다', async () => {
    const env = await loadEnvironment([], '서울특별시', 500);
    expect(env).toEqual({ congestion: [], parks: [], buildings: [] });
    expect(fetchCongestionAlong).not.toHaveBeenCalled();
    expect(fetchBuildings).not.toHaveBeenCalled();
  });
});

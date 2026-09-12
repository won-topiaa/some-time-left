import { describe, expect, it } from 'vitest';
import { KOREA_STATIONS } from '../korea';
import { searchStations } from '../search';
import { findPlaces } from '../../places';
import { configureApi } from '../../../config';

/**
 * 사용자가 겪은 그대로: "봉천역"을 쳤는데 안 나왔다.
 *
 * 번들 안에 역이 하나도 없었기 때문이다. 행정구역 색인에는 역이 없고, 서울
 * 핫스팟 121곳 중 이름에 '역'이 든 46곳은 혼잡도 지점이 우연히 역 이름인 것이라
 * 서울 지하철의 6분의 1도 안 됐다. 서울 밖은 한 곳도 없었다.
 *
 * 이 파일이 통과하는 한 역 이름은 네트워크와 무관하게 찾아진다.
 */
describe('searchStations — 오프라인 바닥: 전국 역', () => {
  it('사용자가 못 찾았던 그 입력', () => {
    const [top] = searchStations('봉천역');

    expect(top).toBeDefined();
    expect(top.name).toBe('봉천역');
    expect(Number.isFinite(top.at.lat)).toBe(true);
    expect(Number.isFinite(top.at.lng)).toBe(true);
  });

  /*
   * OSM은 역 이름에 '역'을 안 붙인다 — 받아 온 1,323곳 중 7곳만 붙어 있었다.
   * 그래서 색인을 만들 때 붙여 뒀다. 안 붙였으면 색인을 넣고도 못 찾는다.
   */
  it('색인의 이름은 모두 역으로 끝난다', () => {
    const wrong = KOREA_STATIONS.filter((row) => !row[0].endsWith('역'));
    expect(wrong.map((row) => row[0])).toEqual([]);
  });

  it("'역'을 붙이든 안 붙이든 찾아진다", () => {
    for (const query of ['봉천', '봉천역', '사당', '사당역']) {
      const found = searchStations(query);
      expect(found.length, query).toBeGreaterThan(0);
    }
  });

  /*
   * 이름 가운데에 든 역도 찾아져야 한다.
   *
   * OSM에는 4호선 '총신대입구(이수)'와 7호선 '이수'가 따로 있다. 색인이 되면
   * "총신대입구(이수)역"과 "이수역"이 되는데, "이수역"을 치면 뒤엣것만 걸린다 —
   * 앞엣것의 '역'이 맨 뒤에 있어서 "이수역"이라는 글자가 이름 안에 없기 때문이다.
   * 그래서 양쪽의 '역'을 떼고 한 번 더 본다("이수" ⊂ "총신대입구(이수)").
   * 환승하는 같은 자리인데 하나만 보여 주면 고르는 사람이 헷갈린다.
   */
  it('이름 가운데에 든 역도 찾아진다', () => {
    const found = searchStations('이수역').map((place) => place.name);

    expect(found).toContain('이수역');
    expect(found).toContain('총신대입구(이수)역');
  });

  it('서울 밖도 있다 — 이게 없어서 시작된 일이다', () => {
    const cases: Array<[string, string]> = [
      ['서면역', '부산'],
      ['반월당역', '대구'],
      ['정부청사역', '대전'],
      ['금남로4가역', '광주'],
      ['부평역', '인천'],
      ['수원역', '경기'],
      ['춘천역', '강원'],
    ];
    for (const [query, where] of cases) {
      const [top] = searchStations(query);
      expect(top, `${where} ${query}`).toBeDefined();
      expect(top.name).toBe(query);
    }
  });

  it('도시철도와 일반철도가 다 들어 있다', () => {
    // 춘천역은 일반철도(경춘선), 봉천역은 도시철도. 둘 다 약속 장소가 된다.
    expect(searchStations('춘천역')).not.toHaveLength(0);
    expect(searchStations('봉천역')).not.toHaveLength(0);
  });

  it('위치를 알면 가까운 쪽이 앞이다', () => {
    /*
     * 같은 이름의 역이 전국에 여럿이다. 시청역은 서울에도 부산에도 있어서
     * 이름으로는 가릴 수 없다 — 좌표로 봐야 한다. 그래서 목적지 화면이
     * 현재 위치를 넘긴다.
     */
    const busan = { lat: 35.1796, lng: 129.0756 };
    const seoul = { lat: 37.5665, lng: 126.978 };
    const [nearBusan] = searchStations('시청역', busan);
    const [nearSeoul] = searchStations('시청역', seoul);

    expect(nearBusan.name).toBe('시청역');
    expect(nearSeoul.name).toBe('시청역');
    // 부산 시청역은 위도 35도대, 서울 시청역은 37도대.
    expect(nearBusan.at.lat).toBeLessThan(36);
    expect(nearSeoul.at.lat).toBeGreaterThan(37);
  });

  it('동명이역을 하나로 뭉개지 않는다', () => {
    const cityHalls = KOREA_STATIONS.filter((row) => row[0] === '시청역');
    // 뭉개면 부산에 서서 '시청역'을 쳤을 때 서울로 보내게 된다.
    expect(cityHalls.length).toBeGreaterThan(1);
  });

  it('북한 역은 없다', () => {
    // 받아 온 데이터에 '조선민주주의인민공화국 철도성' 54곳이 섞여 있었다.
    // 걸어서 갈 수 있는 목적지가 아니다.
    const above = KOREA_STATIONS.filter((row) => row[1] > 38.62);
    expect(above.map((row) => row[0])).toEqual([]);
  });

  it('좌표가 전부 남한 안이다', () => {
    for (const row of KOREA_STATIONS) {
      expect(row[1], row[0]).toBeGreaterThan(33.0);
      expect(row[1], row[0]).toBeLessThan(38.62);
      expect(row[2], row[0]).toBeGreaterThan(125.0);
      expect(row[2], row[0]).toBeLessThan(129.65);
    }
  });
});

describe('findPlaces — 역이 오프라인 바닥에 든다', () => {
  const realFetch = globalThis.fetch;

  it('네트워크가 죽어도 봉천역이 찾아진다', async () => {
    globalThis.fetch = (() => Promise.reject(new Error('offline'))) as typeof fetch;
    configureApi({ tmap: { appKey: null } });
    try {
      const found = await findPlaces('봉천역');
      expect(found.map((place) => place.name)).toContain('봉천역');
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

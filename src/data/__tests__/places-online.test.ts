import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findPlaces } from '../places';
import { searchPlaces } from '../tmap/client';
import { configureApi } from '../../config';
import { KOREA_STATIONS } from '../stations/korea';

/**
 * 사용자가 겪은 그대로: 키가 다 들어간 번들에서 "봉천역"을 쳤는데 안 나왔다.
 *
 * 원인이 두 개였고 둘 다 온라인 층에 있었다. 오프라인 바닥(행정구역 색인 +
 * 서울 핫스팟 122곳)에는 봉천역이 없다 — 봉천동은 법정동이라 행정동 색인에
 * 없고, 핫스팟의 역 46곳에도 없다. 그러니 이 이름은 온라인 층만 안다.
 *
 * 단서는 `npm run check-config`였다. **같은 키·같은 엔드포인트**로 검색해서
 * 결과를 받아 왔다. 그 호출과 앱의 호출의 차이가 곧 원인이었다.
 */

const realFetch = globalThis.fetch;
const near = { lat: 37.5087, lng: 126.9636 };

/** 어떤 주소로 나갔는지 기록하고, 호스트별로 답을 정해 준다. */
function stubNetwork(reply: (url: string) => unknown) {
  const urls: string[] = [];
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input);
    urls.push(url);
    return { ok: true, status: 200, json: async () => reply(url) };
  }) as unknown as typeof fetch;
  return urls;
}

const tmapPoi = (name: string) => ({
  searchPoiInfo: {
    pois: {
      poi: [
        {
          id: '1',
          name,
          frontLat: '37.4823',
          frontLon: '126.9419',
          upperAddrName: '서울',
          middleAddrName: '관악구',
        },
      ],
    },
  },
});

const photonFeature = (name: string) => ({
  features: [
    {
      geometry: { coordinates: [126.9419, 37.4823] },
      properties: { name, countrycode: 'KR', city: '서울', district: '관악구' },
    },
  ],
});

afterEach(() => {
  globalThis.fetch = realFetch;
  configureApi({ tmap: { appKey: null } });
});

describe('TMAP 장소검색 요청', () => {
  beforeEach(() => {
    configureApi({ tmap: { appKey: 'test-key' } });
  });

  /*
   * 반경 검색은 순서가 아니라 **배제**다. 주석에는 "가까운 곳부터 나온다"고
   * 적혀 있었지만, 실제로는 그 반경 밖을 잘라 버린다 — 그래서 온라인 층만 아는
   * 이름이 통째로 사라졌다. 거리로 앞세우는 일은 rankPlaces가 이미 한다.
   */
  it('현재 위치로 걸러 달라고 하지 않는다', async () => {
    const urls = stubNetwork(() => tmapPoi('봉천역'));
    await searchPlaces('봉천역', near);

    expect(urls).toHaveLength(1);
    expect(urls[0]).not.toContain('searchtypCd');
    expect(urls[0]).not.toContain('radius');
  });

  it('보내는 좌표가 무엇인지 밝힌다', async () => {
    // 안 밝히고 좌표를 보내면 기본값에 따라 엉뚱한 자리를 중심으로 삼는다.
    // 같은 파일의 경로 호출은 처음부터 이걸 밝히고 있었다.
    const urls = stubNetwork(() => tmapPoi('봉천역'));
    await searchPlaces('봉천역', near);

    expect(urls[0]).toContain('reqCoordType=WGS84GEO');
    expect(urls[0]).toContain('centerLat=');
    expect(urls[0]).toContain('centerLon=');
  });

  it('위치를 모르면 좌표를 아예 안 보낸다', async () => {
    const urls = stubNetwork(() => tmapPoi('봉천역'));
    await searchPlaces('봉천역');

    expect(urls[0]).not.toContain('centerLat');
    expect(urls[0]).not.toContain('reqCoordType');
  });
});

describe('findPlaces — 있는 층을 전부 묻는다', () => {
  beforeEach(() => {
    configureApi({ tmap: { appKey: 'test-key' } });
  });

  /*
   * 예전엔 OSM을 TMAP이 **정확히 빈손일 때만** 물었다. TMAP이 엉뚱한 한 건이라도
   * 주면 OSM은 아예 안 물었다 — 두 지도가 서로 모르는 이름을 안다는 사실을
   * 쓰지 못한 것이다.
   */
  it('TMAP이 답해도 OSM에 같이 묻는다', async () => {
    const urls = stubNetwork((url) =>
      url.includes('photon') ? photonFeature('봉천역') : tmapPoi('봉천역푸르지오')
    );

    await findPlaces('봉천역', near);

    expect(urls.some((u) => u.includes('/tmap/pois'))).toBe(true);
    expect(urls.some((u) => u.includes('photon'))).toBe(true);
  });

  it('한쪽만 아는 이름도 결과에 들어온다', async () => {
    stubNetwork((url) =>
      url.includes('photon') ? photonFeature('봉천역') : tmapPoi('봉천역푸르지오')
    );

    const found = await findPlaces('봉천역', near);

    expect(found.map((p) => p.name)).toContain('봉천역');
  });

  it('TMAP 키가 없으면 TMAP은 부르지 않는다', async () => {
    configureApi({ tmap: { appKey: null } });
    const urls = stubNetwork(() => photonFeature('봉천역'));

    await findPlaces('봉천역', near);

    expect(urls.some((u) => u.includes('/tmap/'))).toBe(false);
    expect(urls.some((u) => u.includes('photon'))).toBe(true);
  });
});

/**
 * 점검에서 드러난 화면 쪽 두 가지. 둘 다 색인에는 있는데 **화면에는 없었다.**
 */
describe('findPlaces — 색인에 있는 역이 화면까지 온다', () => {
  const offline = () => {
    globalThis.fetch = (() => Promise.reject(new Error('offline'))) as typeof fetch;
    configureApi({ tmap: { appKey: null } });
  };

  /*
   * 핫스팟 121곳 중 41곳이 역 색인과 이름이 겹친다. 그중 넷은 두 좌표가
   * dedupe의 300m를 넘어 둘 다 살아남았다 — 서울역 301m, 수유역 341m,
   * 용산역 355m, 구로디지털단지역 502m. 부제 없는 핫스팟 줄이 위에 서기도 했고,
   * 그걸 누르면 역에서 300~500m 떨어진 혼잡도 측정 지점으로 걸어간다.
   */
  it('핫스팟과 역이 같은 이름 두 줄로 뜨지 않는다', async () => {
    offline();
    for (const name of ['서울역', '수유역', '용산역', '구로디지털단지역']) {
      const found = await findPlaces(name, { lat: 37.5665, lng: 126.978 });
      const same = found.filter((place) => place.name === name);

      /*
       * 같은 이름이 여럿인 것 자체는 잘못이 아니다 — 용산역은 서울과 대구에
       * 실재한다. 잘못은 **한 역이 두 출처에서 두 줄**로 뜨는 것이다. 그러니
       * 줄 수를 세지 않고, 남은 줄이 전부 역 색인의 좌표인지를 본다.
       * 핫스팟 좌표가 섞이면 역에서 300~500m 떨어진 측정 지점으로 걸어간다.
       */
      for (const place of same) {
        const fromIndex = KOREA_STATIONS.some(
          (row) => row[0] === place.name && row[1] === place.at.lat && row[2] === place.at.lng
        );
        expect(fromIndex, `${name} @${place.at.lat},${place.at.lng}`).toBe(true);
      }
    }
  });

  it('동명이역은 둘 다 남고 가까운 쪽이 앞이다', async () => {
    offline();
    const found = await findPlaces('용산역', { lat: 37.5665, lng: 126.978 });
    const yongsan = found.filter((place) => place.name === '용산역');

    // 서울과 대구. 서울시청에서 쳤으니 서울이 앞이다.
    expect(yongsan).toHaveLength(2);
    expect(yongsan[0].at.lat).toBeGreaterThan(37);
  });

  it('남은 한 줄은 역 색인 쪽이다 — 걸어갈 자리가 역 노드다', async () => {
    offline();
    const [top] = await findPlaces('서울역', { lat: 37.5665, lng: 126.978 });
    const station = KOREA_STATIONS.find((row) => row[0] === '서울역');

    expect(station).toBeDefined();
    expect(top.at).toEqual({ lat: station![1], lng: station![2] });
  });

  /*
   * 부산 서면에 서서 "서면"을 치면 눈앞의 서면역이 화면에서 사라졌다.
   * 이름이 정확히 '서면'인 읍면이 전국에 열 곳이라(경주 82km·남해 116km·
   * 순천 143km…) 그들이 rank 0으로 8칸을 다 차지하고, 0m 앞의 서면역은
   * rank 1이라 9번째로 잘렸다. 역 모듈은 이미 1순위로 올려 보냈는데
   * `rankPlaces`가 다른 잣대로 다시 세워서 그랬다.
   */
  it('0m 앞의 역이 먼 동명 읍면에 밀리지 않는다', async () => {
    offline();
    const seomyeon = { lat: 35.15777, lng: 129.05926 };
    const found = await findPlaces('서면', seomyeon);

    expect(found.map((place) => place.name)).toContain('서면역');
    expect(found[0].name).toBe('서면역');
  });

});

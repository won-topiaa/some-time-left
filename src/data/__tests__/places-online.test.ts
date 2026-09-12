import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findPlaces } from '../places';
import { searchPlaces } from '../tmap/client';
import { configureApi } from '../../config';

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

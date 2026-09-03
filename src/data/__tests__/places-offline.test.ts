import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { findPlaces } from '../places';
import { configureApi, isTmapConfigured } from '../../config';

/**
 * 사용자가 겪은 그대로: 키 없는 번들, 네트워크는 안 되거나 느리고, "흑석동"을 친다.
 *
 * 이 파일이 통과하는 한 "찾는 곳이 없어요"는 다시 뜨지 않는다. 지역 이름은
 * 번들 안의 색인이 답하므로 어떤 외부 서비스도 이 결과를 좌우하지 못한다.
 */
describe('findPlaces — 네트워크가 없어도 지역은 찾아진다', () => {
  const realFetch = globalThis.fetch;
  beforeAll(() => {
    // Photon도 TMAP도 전부 죽었다고 치자.
    globalThis.fetch = (() => Promise.reject(new Error('offline'))) as typeof fetch;
  });
  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  beforeEach(() => {
    configureApi({ tmap: { appKey: null } });
    expect(isTmapConfigured()).toBe(false);
  });

  it('"흑석동" — 사용자가 못 찾았던 그 입력', async () => {
    const [top] = await findPlaces('흑석동');

    expect(top).toBeDefined();
    expect(top.name).toBe('흑석동');
    expect(top.address).toBe('서울특별시 동작구');
  });

  it('동·구·시 이름이 전부 찾아진다', async () => {
    // '여의도'는 행정동 이름(여의동)과 달라 색인엔 없지만 핫스팟이 받는다 — 같은 바닥이다.
    for (const name of ['상도동', '동작구', '노량진동', '여의도', '강남구', '판교동', '분당구']) {
      const found = await findPlaces(name);
      expect(found.length, `${name}을 못 찾음`).toBeGreaterThan(0);
      expect(found[0].name).toBe(name);
    }
  });

  it('정확히 맞는 이름이 맨 위다 — 출처가 무엇이든', async () => {
    // '강남'은 지역 색인의 강남구와 핫스팟의 강남역·강남 MICE가 함께 나온다.
    const found = await findPlaces('강남');
    const names = found.map((p) => p.name);

    // 정확히 '강남'인 것은 없으므로, '강남'으로 시작하는 것들이 앞이다.
    for (const name of names) {
      expect(name.includes('강남')).toBe(true);
    }
    // 그리고 정확히 맞는 입력은 그것이 맨 위다.
    expect((await findPlaces('강남역'))[0].name).toBe('강남역');
    expect((await findPlaces('강남구'))[0].name).toBe('강남구');
  });

  it('네트워크가 죽어 있어도 오래 기다리지 않는다', async () => {
    const started = Date.now();
    await findPlaces('흑석동');

    // 오프라인 답이 있으면 온라인은 잠깐만 기다린다. fetch가 즉시 거절되므로
    // 사실상 즉시 돌아와야 한다 — 여기서 몇 초가 걸리면 유예 로직이 깨진 것이다.
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe('findPlaces — 키가 있어도 오프라인 바닥은 그대로다', () => {
  const realFetch = globalThis.fetch;
  beforeAll(() => {
    globalThis.fetch = (() => Promise.reject(new Error('offline'))) as typeof fetch;
  });
  afterAll(() => {
    globalThis.fetch = realFetch;
    configureApi({ tmap: { appKey: null } });
  });

  it('TMAP이 죽은 날에도 "흑석동"은 나온다', async () => {
    configureApi({ tmap: { appKey: 'test-key' } });
    expect(isTmapConfigured()).toBe(true);

    const [top] = await findPlaces('흑석동');

    expect(top.name).toBe('흑석동');
  });
});

import { describe, expect, it } from 'vitest';
import { TtlCache } from './cache';
import { isValidAreaName, normalizePopulation, populationUrl, toCongestionLevel } from './seoul';
import {
  MIN_TOKEN_LENGTH,
  areasFromUrl,
  configFromEnv,
  createHandler,
  createWorkerFetch,
  isAuthorized,
  type ProxyConfig,
} from './handler';

describe('TtlCache', () => {
  it('TTL 안에서는 캐시로 답한다', () => {
    const cache = new TtlCache<string>(1000);
    cache.set('a', 'value', 0);

    expect(cache.get('a', 500)).toBe('value');
  });

  it('TTL이 지나면 없는 것으로 본다', () => {
    const cache = new TtlCache<string>(1000);
    cache.set('a', 'value', 0);

    expect(cache.get('a', 1000)).toBeNull();
    expect(cache.get('a', 1500)).toBeNull();
  });

  it('없는 키는 null', () => {
    expect(new TtlCache<string>(1000).get('없음', 0)).toBeNull();
  });

  it('상한을 넘으면 오래된 것부터 버린다', () => {
    const cache = new TtlCache<string>(1000, 2);
    cache.set('a', '1', 0);
    cache.set('b', '2', 0);
    cache.set('c', '3', 0);

    expect(cache.size).toBe(2);
    expect(cache.get('a', 0)).toBeNull();
    expect(cache.get('c', 0)).toBe('3');
  });
});

describe('isValidAreaName', () => {
  it('정상 장소명을 받는다', () => {
    expect(isValidAreaName('광화문·덕수궁')).toBe(true);
    expect(isValidAreaName('홍대 관광특구')).toBe(true);
  });

  it('경로 문자가 섞이면 거부한다 — 범용 릴레이가 되면 안 된다', () => {
    expect(isValidAreaName('../../etc/passwd')).toBe(false);
    expect(isValidAreaName('a?b=c')).toBe(false);
    expect(isValidAreaName('a#b')).toBe(false);
  });

  it('빈 값과 지나치게 긴 값은 거부한다', () => {
    expect(isValidAreaName('')).toBe(false);
    expect(isValidAreaName('가'.repeat(41))).toBe(false);
  });
});

describe('populationUrl', () => {
  it('키를 URL에 넣고 장소명을 인코딩한다', () => {
    const url = populationUrl(
      { baseUrl: 'http://openapi.seoul.go.kr:8088', key: 'SECRET' },
      '광화문·덕수궁'
    );

    expect(url).toContain('/SECRET/json/citydata_ppltn/1/5/');
    expect(url).toContain(encodeURIComponent('광화문·덕수궁'));
  });
});

describe('normalizePopulation', () => {
  // 실제 응답으로 확인한 형태. PPLTN_TIME은 'YYYY-MM-DD HH:mm' (초·타임존 없음, KST).
  it('실제 응답 형태를 읽는다', () => {
    const result = normalizePopulation(
      {
        'SeoulRtd.citydata_ppltn': [
          {
            AREA_NM: '강남역',
            AREA_CONGEST_LVL: '약간 붐빔',
            PPLTN_TIME: '2026-08-18 17:20',
          },
        ],
      },
      '강남역'
    );

    expect(result).toEqual({
      areaName: '강남역',
      level: '약간 붐빔',
      updatedAt: '2026-08-18 17:20',
    });
  });

  it('혼잡도 등급을 읽는다', () => {
    const result = normalizePopulation(
      {
        'SeoulRtd.citydata_ppltn': [
          { AREA_NM: '광화문·덕수궁', AREA_CONGEST_LVL: '보통', PPLTN_TIME: '2026-08-18 03:20' },
        ],
      },
      '광화문·덕수궁'
    );

    expect(result).toEqual({
      areaName: '광화문·덕수궁',
      level: '보통',
      updatedAt: '2026-08-18 03:20',
    });
  });

  it('알 수 없는 등급이면 null', () => {
    expect(
      normalizePopulation(
        { 'SeoulRtd.citydata_ppltn': [{ AREA_CONGEST_LVL: '아주 붐빔' }] },
        '어딘가'
      )
    ).toBeNull();
  });

  it('빈 응답이면 null', () => {
    expect(normalizePopulation({}, '어딘가')).toBeNull();
  });

  it('장소명이 비면 요청한 이름으로 채운다', () => {
    const result = normalizePopulation(
      { 'SeoulRtd.citydata_ppltn': [{ AREA_CONGEST_LVL: '여유' }] },
      '성수카페거리'
    );

    expect(result?.areaName).toBe('성수카페거리');
  });
});

describe('toCongestionLevel', () => {
  it.each(['여유', '보통', '약간 붐빔', '붐빔'])('"%s"를 받는다', (level) => {
    expect(toCongestionLevel(level)).toBe(level);
  });

  it('그 밖의 값은 null', () => {
    expect(toCongestionLevel('한산')).toBeNull();
    expect(toCongestionLevel(undefined)).toBeNull();
  });
});

describe('areasFromUrl', () => {
  const parse = (query: string, max = 12) =>
    areasFromUrl(new URL(`http://x/population?${query}`), max);

  it('여러 장소를 한 번에 받는다 — 모바일에서 왕복을 줄인다', () => {
    expect(parse('area=강남역&area=홍대 관광특구')).toEqual(['강남역', '홍대 관광특구']);
  });

  it('중복은 한 번만 조회한다', () => {
    expect(parse('area=강남역&area=강남역')).toEqual(['강남역']);
  });

  it('상한을 넘으면 자른다', () => {
    expect(parse('area=a&area=b&area=c', 2)).toHaveLength(2);
  });

  it('이상한 값은 걸러낸다', () => {
    expect(parse('area=강남역&area=../etc')).toEqual(['강남역']);
  });

  it('없으면 빈 배열', () => {
    expect(parse('')).toEqual([]);
  });
});

describe('isAuthorized', () => {
  const request = (auth?: string) =>
    new Request('http://x/population', auth != null ? { headers: { authorization: auth } } : {});

  it('토큰을 안 걸었으면 통과', () => {
    expect(isAuthorized(request(), null)).toBe(true);
  });

  it('맞는 토큰이면 통과', () => {
    expect(isAuthorized(request('Bearer secret'), 'secret')).toBe(true);
  });

  it('틀리거나 없으면 거부', () => {
    expect(isAuthorized(request('Bearer wrong'), 'secret')).toBe(false);
    expect(isAuthorized(request(), 'secret')).toBe(false);
  });
});

describe('configFromEnv', () => {
  const token = 'x'.repeat(MIN_TOKEN_LENGTH);

  it('서울 키가 없으면 뜨지 않는다', () => {
    expect(() => configFromEnv({ PROXY_TOKEN: token })).toThrow(/SEOUL_OPEN_DATA_KEY/);
  });

  it('토큰이 없으면 뜨지 않는다 — 기본이 막힘이어야 한다', () => {
    expect(() => configFromEnv({ SEOUL_OPEN_DATA_KEY: 'k' })).toThrow(/PROXY_TOKEN/);
  });

  it('짧은 토큰은 거부한다', () => {
    expect(() => configFromEnv({ SEOUL_OPEN_DATA_KEY: 'k', PROXY_TOKEN: 'short' })).toThrow(
      /짧아요/
    );
  });

  it('명시적으로 밝히면 토큰 없이도 연다', () => {
    const config = configFromEnv({ SEOUL_OPEN_DATA_KEY: 'k', ALLOW_ANONYMOUS: 'true' });
    expect(config.authToken).toBeNull();
  });

  it('제대로 주면 설정이 만들어진다', () => {
    const config = configFromEnv({ SEOUL_OPEN_DATA_KEY: 'k', PROXY_TOKEN: token });

    expect(config.seoulKey).toBe('k');
    expect(config.authToken).toBe(token);
    expect(config.seoulBaseUrl).toBe('http://openapi.seoul.go.kr:8088');
  });
});

describe('createHandler', () => {
  const config: ProxyConfig = {
    seoulBaseUrl: 'http://upstream.invalid',
    seoulKey: 'KEY',
    authToken: null,
    cacheTtlMs: 300000,
    timeoutMs: 100,
    maxAreasPerRequest: 12,
  };

  it('/health는 상태를 준다', async () => {
    const response = await createHandler(config)(new Request('http://x/health'));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
  });

  it('없는 경로는 404', async () => {
    const response = await createHandler(config)(new Request('http://x/nope'));
    expect(response.status).toBe(404);
  });

  it('GET이 아니면 405', async () => {
    const response = await createHandler(config)(
      new Request('http://x/population', { method: 'POST' })
    );
    expect(response.status).toBe(405);
  });

  it('area가 없으면 400', async () => {
    const response = await createHandler(config)(new Request('http://x/population'));
    expect(response.status).toBe(400);
  });

  it('토큰이 걸려 있으면 401', async () => {
    const guarded = createHandler({ ...config, authToken: 'secret' });
    const response = await guarded(new Request('http://x/population?area=강남역'));

    expect(response.status).toBe(401);
  });

  it('업스트림이 죽어도 200과 빈 목록으로 답한다 — 앱 흐름을 막지 않는다', async () => {
    const response = await createHandler(config)(
      new Request('http://x/population?area=강남역')
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ areas: [] });
  });
});

describe('createWorkerFetch', () => {
  const token = 'x'.repeat(MIN_TOKEN_LENGTH);

  it('설정이 잘못되면 1101이 아니라 읽을 수 있는 오류를 준다', async () => {
    const fetchHandler = createWorkerFetch({});
    const response = await fetchHandler(new Request('http://x/health'));

    expect(response.status).toBe(500);
    const body = (await response.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/SEOUL_OPEN_DATA_KEY/);
  });

  it('토큰이 빠진 것도 그대로 알려준다', async () => {
    const fetchHandler = createWorkerFetch({ SEOUL_OPEN_DATA_KEY: 'k' });
    const body = (await (await fetchHandler(new Request('http://x/health'))).json()) as {
      error: string;
    };

    expect(body.error).toMatch(/PROXY_TOKEN/);
  });

  it('오류 메시지에 비밀값을 담지 않는다', async () => {
    const fetchHandler = createWorkerFetch({ SEOUL_OPEN_DATA_KEY: 'SUPERSECRET' });
    const text = await (await fetchHandler(new Request('http://x/health'))).text();

    expect(text).not.toContain('SUPERSECRET');
  });

  it('설정이 정상이면 평소처럼 답한다', async () => {
    const fetchHandler = createWorkerFetch({ SEOUL_OPEN_DATA_KEY: 'k', PROXY_TOKEN: token });
    const response = await fetchHandler(new Request('http://x/health'));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
  });
});

/**
 * 앱 아이콘.
 *
 * `brand.icon`은 파일 경로가 아니라 이미지 주소라 어딘가에 떠 있어야 한다.
 * 이미 떠 있는 이 프록시가 함께 낸다 — 토큰 없이, 바이트 그대로.
 */
describe('GET /icon.png', () => {
  const config = {
    seoulBaseUrl: 'http://seoul.test',
    seoulKey: 'k',
    authToken: 'abcdefghijklmnopqrstuvwxyz012345',
    cacheTtlMs: 1000,
    timeoutMs: 1000,
    maxAreasPerRequest: 5,
  };

  it('토큰 없이도 준다 — 토스 앱이 그냥 불러야 한다', async () => {
    const handle = createHandler(config);
    const response = await handle(new Request('https://p.test/icon.png'));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
  });

  it('진짜 PNG 바이트다', async () => {
    const handle = createHandler(config);
    const response = await handle(new Request('https://p.test/icon.png'));
    const bytes = new Uint8Array(await response.arrayBuffer());

    // PNG 매직 넘버
    expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(bytes.length).toBeGreaterThan(10_000);
  });

  it('오래 캐시해도 된다고 알린다', async () => {
    const handle = createHandler(config);
    const response = await handle(new Request('https://p.test/icon.png'));
    expect(response.headers.get('cache-control')).toContain('max-age');
  });

  it('아이콘 경로가 열렸다고 혼잡도까지 열리지는 않는다', async () => {
    const handle = createHandler(config);
    const response = await handle(new Request('https://p.test/population?area=강남역'));
    expect(response.status).toBe(401);
  });
});

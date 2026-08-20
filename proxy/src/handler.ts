/**
 * 요청 처리기.
 *
 * 웹 표준 Request/Response로 쓴다. Node 서버(`server.ts`)와
 * Cloudflare Workers(`worker.ts`)가 같은 함수를 공유한다.
 */

import { TtlCache } from './cache.ts';
import { fetchPopulation, isValidAreaName, type AreaPopulation } from './seoul.ts';

export interface ProxyConfig {
  seoulBaseUrl: string;
  seoulKey: string;
  /**
   * `Authorization: Bearer <token>`으로 요구할 토큰.
   * null이면 누구나 부를 수 있다 — 명시적으로 허용했을 때만 그렇게 된다.
   */
  authToken: string | null;
  /** 캐시 유지 시간 (ms). 서울이 5분 단위로 갱신하므로 그에 맞춘다. */
  cacheTtlMs: number;
  /** 업스트림 타임아웃 (ms) */
  timeoutMs: number;
  /** 한 요청에서 조회할 수 있는 장소 수 */
  maxAreasPerRequest: number;
}

/** 이보다 짧은 토큰은 무차별 대입에 버티지 못한다. */
export const MIN_TOKEN_LENGTH = 24;

export function configFromEnv(env: Record<string, string | undefined>): ProxyConfig {
  const key = env.SEOUL_OPEN_DATA_KEY;
  if (key == null || key === '') {
    throw new Error('SEOUL_OPEN_DATA_KEY가 필요합니다.');
  }

  const token = env.PROXY_TOKEN != null && env.PROXY_TOKEN !== '' ? env.PROXY_TOKEN : null;

  // 토큰 없이 열어두면 주소를 아는 누구나 서울 인증키 할당량을 쓴다.
  // 실수로 열리는 일이 없도록 기본은 '막힘'이고, 열려면 명시적으로 밝혀야 한다.
  if (token == null && env.ALLOW_ANONYMOUS !== 'true') {
    throw new Error(
      [
        'PROXY_TOKEN이 필요합니다.',
        '토큰 없이 띄우면 주소를 아는 누구나 서울 인증키 할당량을 쓸 수 있어요.',
        '',
        '  토큰 만들기:  npm run gen-token',
        '  그래도 열려면: ALLOW_ANONYMOUS=true',
      ].join('\n')
    );
  }

  if (token != null && token.length < MIN_TOKEN_LENGTH) {
    throw new Error(
      `PROXY_TOKEN이 너무 짧아요. ${MIN_TOKEN_LENGTH}자 이상으로 만들어 주세요 (npm run gen-token).`
    );
  }

  return {
    seoulBaseUrl: env.SEOUL_BASE_URL ?? 'http://openapi.seoul.go.kr:8088',
    seoulKey: key,
    authToken: token,
    cacheTtlMs: Number(env.CACHE_TTL_MS ?? 5 * 60 * 1000),
    timeoutMs: Number(env.UPSTREAM_TIMEOUT_MS ?? 6000),
    maxAreasPerRequest: Number(env.MAX_AREAS ?? 12),
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** 토큰이 설정돼 있으면 맞는지 본다. 열린 릴레이가 되지 않도록. */
export function isAuthorized(request: Request, token: string | null): boolean {
  if (token == null) {
    return true;
  }
  const header = request.headers.get('authorization') ?? '';
  return header === `Bearer ${token}`;
}

/**
 * 요청에서 조회할 장소 목록을 뽑는다.
 * `?area=A&area=B` 형태로 여러 곳을 한 번에 받는다 — 모바일에서 왕복을 줄이려고.
 */
export function areasFromUrl(url: URL, max: number): string[] {
  const raw = url.searchParams.getAll('area');
  const valid = raw.map((a) => a.trim()).filter(isValidAreaName);

  // 같은 장소를 여러 번 넘겨도 한 번만 조회한다.
  return [...new Set(valid)].slice(0, max);
}

/**
 * Workers 진입점이 쓰는 래퍼.
 *
 * 설정이 잘못되면 예외가 아니라 **읽을 수 있는 응답**을 돌려준다.
 * Workers에서 예외를 그대로 던지면 `error code: 1101`만 보이고 원인을 알 수 없다.
 */
export function createWorkerFetch(env: Record<string, string | undefined>) {
  let handle: ((request: Request) => Promise<Response>) | null = null;

  return async function fetchHandler(request: Request): Promise<Response> {
    if (handle == null) {
      try {
        handle = createHandler(configFromEnv(env));
      } catch (error) {
        const message = error instanceof Error ? error.message : '설정을 읽지 못했어요.';
        // 비밀값은 담지 않는다. 무엇이 빠졌는지만 말한다.
        return json({ ok: false, error: message }, 500);
      }
    }
    return handle(request);
  };
}

export function createHandler(config: ProxyConfig, now: () => number = Date.now) {
  const cache = new TtlCache<AreaPopulation>(config.cacheTtlMs);

  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method !== 'GET') {
      return json({ error: 'GET만 지원해요.' }, 405);
    }

    if (url.pathname === '/health') {
      return json({ ok: true, cached: cache.size });
    }

    if (url.pathname !== '/population') {
      return json({ error: '없는 경로예요.' }, 404);
    }

    if (!isAuthorized(request, config.authToken)) {
      return json({ error: '인증이 필요해요.' }, 401);
    }

    const areas = areasFromUrl(url, config.maxAreasPerRequest);
    if (areas.length === 0) {
      return json({ error: 'area 파라미터가 필요해요.' }, 400);
    }

    const nowMs = now();

    const results = await Promise.all(
      areas.map(async (area) => {
        const cached = cache.get(area, nowMs);
        if (cached != null) {
          return cached;
        }

        const fetched = await fetchPopulation(
          { baseUrl: config.seoulBaseUrl, key: config.seoulKey },
          area,
          config.timeoutMs
        );

        if (fetched != null) {
          cache.set(area, fetched, nowMs);
        }
        return fetched;
      })
    );

    // 못 읽은 장소는 빼고 준다. 하나 실패해도 나머지는 쓸 수 있어야 한다.
    return json({ areas: results.filter((r): r is AreaPopulation => r != null) });
  };
}

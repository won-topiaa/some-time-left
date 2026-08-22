/**
 * 요청 처리기.
 *
 * 웹 표준 Request/Response로 쓴다. Node 서버(`server.ts`)와
 * Cloudflare Workers(`worker.ts`)가 같은 함수를 공유한다.
 */

import { TtlCache } from './cache.ts';
import { ICON_PNG_BASE64 } from './icon-data.ts';
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
    cacheTtlMs: numberEnv('CACHE_TTL_MS', env.CACHE_TTL_MS, 5 * 60 * 1000),
    timeoutMs: numberEnv('UPSTREAM_TIMEOUT_MS', env.UPSTREAM_TIMEOUT_MS, 6000),
    maxAreasPerRequest: numberEnv('MAX_AREAS', env.MAX_AREAS, 12),
  };
}

/**
 * 숫자 환경변수. **읽을 수 없으면 시작에서 멈춘다.**
 *
 * Number()만 쓰면 "5m" 같은 값이 NaN으로 통과해서 셋 다 조용히 망가진다 —
 * 캐시는 영영 안 만료되고(NaN 비교는 늘 false), 타임아웃은 즉시 발화하고,
 * 장소 수 제한은 매 요청을 400으로 만든다. 키 검증처럼 여기서도 소리 내어 죽는다.
 */
function numberEnv(name: string, raw: string | undefined, fallback: number): number {
  if (raw == null || raw === '') {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name}는 양수여야 합니다. 지금 값: "${raw}" (예: ${fallback})`);
  }
  return value;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/**
 * 시간이 일정한 문자열 비교.
 *
 * ===는 첫 불일치에서 끝나서, 응답 시간을 재면 토큰을 앞에서부터 맞혀 갈 수 있다.
 * 네트워크 흔들림 때문에 실제로 해내긴 어렵지만, 이 프록시의 존재 이유가 서울
 * 인증키 할당량을 지키는 것이라 문 앞 비교만큼은 제대로 둔다.
 * 길이가 달라도 같은 시간을 쓰도록 자기 자신과 비교해 시간을 채운다.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const sameLength = a.length === b.length;
  const other = sameLength ? b : a;

  let diff = sameLength ? 0 : 1;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ other.charCodeAt(i);
  }
  return diff === 0;
}

/** 토큰이 설정돼 있으면 맞는지 본다. 열린 릴레이가 되지 않도록. */
export function isAuthorized(request: Request, token: string | null): boolean {
  if (token == null) {
    return true;
  }
  const header = request.headers.get('authorization') ?? '';
  return constantTimeEqual(header, `Bearer ${token}`);
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

    /*
     * 앱 아이콘.
     *
     * `granite.config.ts`의 `brand.icon`은 파일 경로가 아니라 이미지 **주소**라
     * 어딘가에 HTTPS로 떠 있어야 한다. 이 프록시가 이미 떠 있으니 여기서 함께 낸다.
     * 토큰을 요구하지 않는다 — 토스 앱이 이 주소를 그냥 불러야 하고,
     * 아이콘은 애초에 감출 것이 아니다.
     */
    if (url.pathname === '/icon.png') {
      return iconResponse();
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

/**
 * 아이콘 바이트. 배포 사이에 안 바뀌므로 **한 번만 푼다** —
 * 요청마다 41KB base64를 다시 풀면 아이솔레이트의 CPU 예산만 축낸다.
 */
let iconBytes: Uint8Array | null = null;

function decodeIcon(): Uint8Array {
  if (iconBytes != null) {
    return iconBytes;
  }
  const binary = atob(ICON_PNG_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  iconBytes = bytes;
  return bytes;
}

/** base64로 품고 있는 아이콘을 PNG로 내보낸다. */
function iconResponse(): Response {
  return new Response(decodeIcon(), {
    headers: {
      'content-type': 'image/png',
      // 아이콘은 배포할 때만 바뀐다. 오래 캐시해도 된다.
      'cache-control': 'public, max-age=86400',
      'access-control-allow-origin': '*',
    },
  });
}

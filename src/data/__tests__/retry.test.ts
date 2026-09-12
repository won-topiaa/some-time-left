import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ApiError, requestJson } from '../http';
import { isRetryable, withRetry } from '../retry';
import { routeFailureLine } from '../route-failure';

/**
 * 길찾기에서 최단 경로 한 번은 다른 모든 것의 기준점이다. 그 한 번이 흔들리면
 * 화면이 통째로 실패로 갔는데, 거기엔 아무 보험이 없었다 — 지하철이 터널을
 * 지나는 동안에 눌렀다는 이유로 "길을 찾지 못했어요"가 떴다.
 *
 * 그렇다고 아무 실패나 다시 부르면 안 된다. 도로망이 "그런 길은 없다"고 대답한
 * 것을 다시 묻는 건 같은 대답을 두 번 받으면서 사람만 두 배로 기다리는 일이다.
 */
describe('isRetryable', () => {
  it('기다리면 풀릴 실패만 참이다', () => {
    expect(isRetryable(new ApiError('응답이 너무 늦어요', null, undefined, true))).toBe(true);
    expect(isRetryable(new ApiError('그 근처에는 걸을 수 있는 길이 없어요', null))).toBe(false);
  });

  it('모르는 실패는 다시 해볼 만하다고 치지 않는다', () => {
    // 근거 없이 다시 부르면 같은 실패를 두 배로 만들 뿐이다.
    expect(isRetryable(new Error('무언가 잘못됐다'))).toBe(false);
    expect(isRetryable('문자열')).toBe(false);
    expect(isRetryable(null)).toBe(false);
  });
});

describe('withRetry', () => {
  const retryable = () => new ApiError('네트워크에 연결하지 못했어요', null, undefined, true);

  it('한 번 흔들린 요청은 다시 해서 살린다', async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls === 1) {
          throw retryable();
        }
        return '길';
      },
      { tries: 2, spacingMs: 0 }
    );

    expect(result).toBe('길');
    expect(calls).toBe(2);
  });

  it('다시 해도 소용없는 실패는 곧장 던진다', async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw new ApiError('그 근처에는 걸을 수 있는 길이 없어요', null);
        },
        { tries: 3, spacingMs: 0 }
      )
    ).rejects.toThrow('걸을 수 있는 길이 없어요');

    // 두 번 묻지 않는다. 사람을 두 배로 기다리게 하면서 같은 답을 받는 일이다.
    expect(calls).toBe(1);
  });

  it('끝내 안 되면 마지막 이유를 그대로 올려 보낸다', async () => {
    // 원인을 갈아 끼우면 화면이 무슨 일이 있었는지 말할 수 없게 된다.
    await expect(
      withRetry(async () => { throw retryable(); }, { tries: 2, spacingMs: 0 })
    ).rejects.toThrow('네트워크에 연결하지 못했어요');
  });

  it('몇 번째 시도인지 알려준다 — 첫 번은 짧게 끊으라고', async () => {
    const seen: number[] = [];
    await withRetry(
      async (index) => {
        seen.push(index);
        if (index === 0) {
          throw retryable();
        }
        return true;
      },
      { tries: 2, spacingMs: 0 }
    );

    expect(seen).toEqual([0, 1]);
  });

  it('성공하면 한 번만 부른다', async () => {
    let calls = 0;
    await withRetry(async () => { calls += 1; return 1; }, { tries: 3, spacingMs: 0 });
    expect(calls).toBe(1);
  });
});

describe('ApiError.retryable', () => {
  it('기본값은 거짓이다', () => {
    // 판단할 근거가 없으면 다시 부르지 않는다.
    expect(new ApiError('무슨 일', null).retryable).toBe(false);
  });
});

describe('requestJson이 붙이는 판단', () => {
  const realFetch = globalThis.fetch;
  let status = 200;

  beforeEach(() => {
    globalThis.fetch = (async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => ({}),
    })) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  async function failureFor(code: number): Promise<ApiError> {
    status = code;
    try {
      await requestJson('https://example.test/x');
    } catch (error) {
      return error as ApiError;
    }
    throw new Error(`${code}인데 실패하지 않았다`);
  }

  it('429와 5xx는 시간이 푼다', async () => {
    // "너무 자주 물었다"와 "지금 우리 쪽이 문제다" — 둘 다 잠시 뒤엔 다르다.
    expect((await failureFor(429)).retryable).toBe(true);
    expect((await failureFor(500)).retryable).toBe(true);
    expect((await failureFor(503)).retryable).toBe(true);
  });

  it('4xx는 우리가 잘못 물은 것이라 백 번을 물어도 같다', async () => {
    expect((await failureFor(400)).retryable).toBe(false);
    expect((await failureFor(401)).retryable).toBe(false);
    expect((await failureFor(404)).retryable).toBe(false);
  });
});

describe('routeFailureLine', () => {
  /*
   * 이 갈래가 없어서 도로망의 '없다'는 대답까지 "잠시 뒤에 다시 해볼까요?"로
   * 나갔다. 눌러도 같은 화면이 돌아오는 막다른 길이고, 사람은 앱이 고장 난 줄 안다.
   */
  it('도로망이 대답한 "없다"에는 다시 해보라고 하지 않는다', () => {
    const line = routeFailureLine(new ApiError('길을 찾지 못했어요 (NoRoute)', null));

    expect(line).not.toContain('잠시 뒤에');
    expect(line).toContain('장소를 다시');
  });

  it('네트워크가 흔들린 것에는 다시 해보라고 한다', () => {
    const line = routeFailureLine(
      new ApiError('응답이 너무 늦어요', null, undefined, true)
    );

    expect(line).toContain('잠시 뒤에');
    // 멀쩡한 목적지를 의심하게 만들지 않는다.
    expect(line).not.toContain('장소를 다시');
  });

  it('모르는 실패에는 장소를 의심하라고 하지 않는다', () => {
    // 우리가 모르는 것을 사용자의 선택 탓으로 돌리지 않는다.
    expect(routeFailureLine(new Error('알 수 없음'))).toContain('잠시 뒤에');
  });

  it('걸을 수 있는 길이 없는 곳은 그대로 말한다', () => {
    expect(routeFailureLine(new ApiError('그 근처에는 걸을 수 있는 길이 없어요', null))).toContain(
      '걸을 수 있는 길이 없어요'
    );
  });
});

/**
 * 보험이 실제로 그 한 번에 걸려 있는지 본다.
 *
 * 위의 단위 테스트는 `withRetry`가 옳게 도는지만 보장한다. 정작 중요한 건
 * **최단 경로를 부르는 그 자리**가 그걸 쓰고 있느냐다 — 이 저장소에는 훅을
 * 돌릴 렌더러가 없으므로, 약속을 소스에 못으로 박는다.
 */
describe('useRouteSuggestion — 최단 경로에 걸린 보험', () => {
  const source = readFileSync(
    join(__dirname, '..', '..', 'state', 'useRouteSuggestion.ts'),
    'utf8'
  );
  const findShortest = source.slice(
    source.indexOf('async function findShortest'),
    source.indexOf('export function useRouteSuggestion')
  );

  it('최단 경로를 부르는 자리가 다시 해볼 만한지 묻는다', () => {
    expect(findShortest).toContain('.shortest(');
    // 이게 없으면 흔들린 요청 한 번이 화면을 통째로 실패로 만든다.
    expect(findShortest).toContain('isRetryable(');
  });

  it('시도마다 제한 시간을 달리 준다', () => {
    // 처음부터 길게 잡으면 실패한 날 사람이 두 배로 기다린다.
    expect(findShortest).toContain('SHORTEST_TIMEOUTS_MS[round]');
    expect(source).toMatch(/SHORTEST_TIMEOUTS_MS = \[\d+, \d+\]/);
  });
});

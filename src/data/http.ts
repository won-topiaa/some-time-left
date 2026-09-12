import { getApiConfig } from '../config';

export class ApiError extends Error {
  /**
   * 기다렸다 다시 물으면 답이 달라질 수 있는 실패인가.
   *
   * 이 구분이 없으면 두 가지가 한 문장으로 뭉뚱그려진다 — 전파가 흔들린 것과
   * 도로망이 "그런 길은 없다"고 대답한 것. 앞엣것에 "장소를 다시 골라보세요"라고
   * 하면 멀쩡한 목적지를 의심하게 하고, 뒤엣것에 "잠시 뒤에 다시"라고 하면
   * 눌러도 같은 화면이 돌아오는 막다른 길이 된다.
   *
   * 기본값은 거짓이다. 판단할 근거가 없는 실패를 다시 부르면 같은 실패를
   * 두 배로 만들 뿐이다 — 다시 해볼 만하다는 건 아는 쪽이 말해야 한다.
   */
  readonly retryable: boolean;

  constructor(
    message: string,
    readonly status: number | null,
    readonly cause?: unknown,
    retryable = false
  ) {
    super(message);
    this.name = 'ApiError';
    this.retryable = retryable;
  }
}

/** 타임아웃이 있는 JSON 요청. 길 찾는 화면에서 무한정 기다리게 두지 않는다. */
export async function requestJson<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = getApiConfig().timeoutMs
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });

    if (!response.ok) {
      // 429는 "너무 자주 물었다", 5xx는 "지금 우리 쪽이 문제다" — 둘 다 시간이 푼다.
      // 4xx는 우리가 잘못 물은 것이라 백 번을 물어도 같은 답이 온다.
      const retryable = response.status === 429 || response.status >= 500;
      throw new ApiError(
        `요청이 실패했어요 (${response.status})`,
        response.status,
        undefined,
        retryable
      );
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    // 늦은 것도, 못 닿은 것도 다음 번엔 될 수 있다. 지하철이 터널을 지나는 중일 수도 있고.
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('응답이 너무 늦어요', null, error, true);
    }
    throw new ApiError('네트워크에 연결하지 못했어요', null, error, true);
  } finally {
    clearTimeout(timer);
  }
}

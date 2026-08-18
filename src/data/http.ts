import { getApiConfig } from '../config';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
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
      throw new ApiError(`요청이 실패했어요 (${response.status})`, response.status);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('응답이 너무 늦어요', null, error);
    }
    throw new ApiError('네트워크에 연결하지 못했어요', null, error);
  } finally {
    clearTimeout(timer);
  }
}

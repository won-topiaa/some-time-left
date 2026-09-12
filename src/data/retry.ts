/**
 * 다시 해볼 만한 실패는 화면까지 올리기 전에 한 번 더 해 본다.
 *
 * 길찾기에서 **최단 경로 한 번**은 다른 모든 것의 기준점이다. 그 한 번이 실패하면
 * 계획도, 후보도, 도착 시각도 세울 수 없어서 화면은 통째로 실패로 간다. 그런데
 * 그 한 번에는 아무 보험도 없었다 — 지하철이 터널을 지나는 동안, 신호가 한 칸
 * 떨어지는 순간에 걸리면 "길을 찾지 못했어요"가 뜨고, 사람이 직접 버튼을 눌러야
 * 했다. 사람에게 시킬 일이 아니다.
 *
 * 그렇다고 아무 실패나 다시 부르면 안 된다. 도로망이 "그런 길은 없다"고 대답한
 * 것을 다시 묻는 건 같은 대답을 두 번 받는 일이고, 그 사이 사람은 두 배로 기다린다.
 * 그래서 `ApiError.retryable`이 참인 것만 다시 부른다.
 */

import { ApiError } from './http';

export interface RetryOptions {
  /** 첫 시도를 포함해 몇 번까지 해 보는가. */
  tries: number;
  /** 시도 사이에 쉬는 시간 (ms). */
  spacingMs: number;
}

/** 기다렸다 다시 물으면 답이 달라질 수 있는가. */
export function isRetryable(failure: unknown): boolean {
  return failure instanceof ApiError && failure.retryable;
}

/** 잠깐 쉰다. 바로 다시 던지면 같은 순간의 같은 장애를 만난다. */
export function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * `attempt`를 최대 `tries`번 부른다.
 *
 * `attempt`는 몇 번째인지를 받는다 — 첫 시도는 짧게 끊고 다음 시도에 넉넉히 주는
 * 식으로 쓰라고 넘긴다. 첫 번째를 길게 잡으면 실패했을 때 두 배로 기다리게 된다.
 *
 * 다시 해볼 수 없는 실패는 **곧장** 던진다. 마지막 시도의 실패도 그대로 던진다 —
 * 원인을 갈아 끼우지 않는다. 화면이 무슨 일이 있었는지 말할 수 있어야 한다.
 */
export async function withRetry<T>(
  attempt: (index: number) => Promise<T>,
  { tries, spacingMs }: RetryOptions
): Promise<T> {
  let lastFailure: unknown;

  for (let index = 0; index < Math.max(1, tries); index += 1) {
    try {
      return await attempt(index);
    } catch (failure) {
      lastFailure = failure;
      if (!isRetryable(failure) || index === tries - 1) {
        throw failure;
      }
      await pause(spacingMs);
    }
  }

  throw lastFailure;
}

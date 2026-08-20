/**
 * 확장자 없는 상대 임포트를 `.ts`로 이어 주는 resolve 훅.
 * 등록은 `ts-resolve.mjs`가 한다 — 훅은 별도 스레드에서 불리므로
 * 등록하는 쪽과 파일을 나눠야 자기 자신을 다시 등록하지 않는다.
 */

export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (error) {
    // 확장자를 생략한 상대 경로일 때만 손을 댄다. 그 밖의 실패는 그대로 던진다 —
    // 오타로 없는 모듈을 부른 것까지 조용히 삼키면 원인을 찾을 수 없다.
    const relative = specifier.startsWith('./') || specifier.startsWith('../');
    if (!relative || /\.[a-z]+$/i.test(specifier)) {
      throw error;
    }
    for (const suffix of ['.ts', '/index.ts']) {
      try {
        return await next(`${specifier}${suffix}`, context);
      } catch {
        /* 다음 후보 */
      }
    }
    throw error;
  }
}

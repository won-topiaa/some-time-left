/**
 * Cloudflare Workers 진입점.
 *
 * Workers는 HTTPS를 기본으로 주고 무료 티어로도 충분하다.
 * 서울 API가 평문 HTTP라 업스트림 fetch가 http:// 로 나가는데,
 * Workers는 이를 허용한다. 만약 배포 환경에서 막힌다면 `server.ts`(Node)로
 * 옮기면 된다 — 핸들러는 같은 것을 쓴다.
 *
 * 설정 오류를 예외로 던지지 않는 이유는 `createWorkerFetch` 주석 참고.
 */

import { createWorkerFetch } from './handler.ts';

type Env = Record<string, string | undefined>;

let cached: ((request: Request) => Promise<Response>) | null = null;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    cached ??= createWorkerFetch(env);
    return cached(request);
  },
};

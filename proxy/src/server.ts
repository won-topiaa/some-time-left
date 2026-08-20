/**
 * Node 서버 진입점.
 *
 * 웹 표준 Request/Response로 쓴 핸들러를 node:http에 붙인다.
 * 의존성이 하나도 없어 어디서든 `node --experimental-strip-types` 없이도
 * 빌드 후 바로 돌아간다.
 *
 * HTTPS 종단은 앞단(Fly·Railway·Render·nginx 등)이 맡는 것을 전제로 한다.
 * 이 프로세스 자체는 평문 HTTP를 듣는다 — 앞단이 이미 TLS를 끊어 주기 때문이다.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { configFromEnv, createHandler } from './handler.ts';

const config = configFromEnv(process.env);
const handle = createHandler(config);
const port = Number(process.env.PORT ?? 8787);

function toRequest(req: IncomingMessage): Request {
  const host = req.headers.host ?? `localhost:${port}`;
  const url = new URL(req.url ?? '/', `http://${host}`);

  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') {
      headers.set(name, value);
    }
  }

  return new Request(url, { method: req.method ?? 'GET', headers });
}

async function send(response: Response, res: ServerResponse): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, name) => res.setHeader(name, value));
  res.end(await response.text());
}

createServer((req, res) => {
  handle(toRequest(req))
    .then((response) => send(response, res))
    .catch(() => {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: '서버 오류' }));
    });
}).listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`서울 인구데이터 프록시가 :${port} 에서 듣고 있어요.`);
});

#!/usr/bin/env node
/**
 * `src/config.local.ts`가 없으면 만든다.
 *
 * 비밀값을 추적되는 파일(`_app.tsx`)에 적으면 실수로 커밋되거나 `git pull` 때
 * 충돌한다. 그래서 비밀값만 이 파일에 몰아넣고 .gitignore에 둔다.
 *
 * 이 파일이 없으면 번들이 깨지므로, dev·build·typecheck 전에 자동으로 만든다.
 */

import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const target = join(dirname(dirname(fileURLToPath(import.meta.url))), 'src', 'config.local.ts');

if (existsSync(target)) {
  process.exit(0);
}

writeFileSync(
  target,
  `/**
 * 로컬 전용 비밀값. **이 파일은 커밋되지 않는다** (.gitignore).
 *
 * 값을 채우면 해당 기능이 켜지고, null이면 그 기능만 꺼진 채로 앱은 계속 돈다.
 *   tmapAppKey 없음           → 경로가 mock
 *   congestionProxyToken 없음 → quiet이 중립값(0.5)
 *   publicDataServiceKey 없음 → scenic이 중립값(0.5)
 *   vworldKey 없음            → shade가 기본 건물 높이(15m)
 *
 * 지우더라도 npm run dev/build 때 다시 만들어진다.
 */
export const localSecrets = {
  /** openapi.sk.com 앱 키 */
  tmapAppKey: null as string | null,
  /** proxy/.env의 PROXY_TOKEN과 같은 값 */
  congestionProxyToken: null as string | null,
  /** data.go.kr 인증키 (Decoding 키) */
  publicDataServiceKey: null as string | null,
  /** vworld.kr 인증키 */
  vworldKey: null as string | null,
};
`,
  'utf8'
);

console.log('src/config.local.ts를 만들었습니다. 비밀값을 여기 넣으세요 (커밋되지 않습니다).');

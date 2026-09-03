#!/usr/bin/env node
/**
 * `src/config.local.ts`가 없으면 만들고, **어떤 번들이 나가는지 말한다.**
 *
 * 비밀값을 추적되는 파일에 적으면 실수로 커밋되거나 `git pull` 때 충돌한다.
 * 그래서 비밀값만 이 파일에 몰아넣고 .gitignore에 둔다.
 * 이 파일이 없으면 번들이 깨지므로, dev·build·typecheck 전에 자동으로 만든다.
 *
 * ## 왜 말까지 하게 됐나
 *
 * 이 스크립트는 오래 조용했다. 키가 전부 null인 파일을 만들고 아무 말 없이
 * exit 0을 했다. 그래서 깨끗한 컨테이너에서 `npm run build`를 하면 키 없는 번들이
 * 조용히 나갔고, 그 시절엔 키가 없으면 좌표를 **지어내는** 공급자로 떨어졌다 —
 * 산자락을 가로지르는 삼각형이 "3분 전에는 닿는 길이에요"와 함께 실기기에 떴다.
 * 사고가 아니라 이 파이프라인의 정상 출력이었다.
 *
 * 지어내는 쪽은 지웠으므로 이제 키가 없어도 진짜 도로망(OSRM)으로 돈다.
 * 그래서 여기서 빌드를 **막지는 않는다** — 키 없는 심사용 번들은 정당하다.
 * 다만 무엇이 켜지고 무엇이 꺼진 채 나가는지는 매번 눈에 보여야 한다.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const target = join(dirname(dirname(fileURLToPath(import.meta.url))), 'src', 'config.local.ts');

const TEMPLATE = `/**
 * 로컬 전용 비밀값. **이 파일은 커밋되지 않는다** (.gitignore).
 *
 * 값을 채우면 해당 기능이 켜지고, null이면 그 기능만 꺼진 채로 앱은 계속 돈다.
 *   tmapAppKey 없음           → 경로가 OSRM(키 없는 실제 도로망)으로. 좌표는 진짜다.
 *   congestionProxyToken 없음 → quiet이 중립값(0.5)
 *   publicDataServiceKey 없음 → scenic이 중립값(0.5)
 *   vworldKey 없음            → shade가 중립값(0.5)
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
`;

if (!existsSync(target)) {
  writeFileSync(target, TEMPLATE, 'utf8');
  console.log('src/config.local.ts를 만들었습니다. 비밀값을 여기 넣으세요 (커밋되지 않습니다).');
}

/**
 * 채워진 키를 센다.
 *
 * 파일을 읽어 `이름: null`인지만 본다 — **값은 절대 출력하지 않는다.** 빌드 로그는
 * CI에 남고 화면에 뜬다. 켜졌는지 꺼졌는지만 알면 충분하다.
 */
const source = readFileSync(target, 'utf8');
const isSet = (name) => !new RegExp(`${name}\\s*:\\s*null\\b`).test(source);

const keys = [
  ['tmapAppKey', 'TMAP 보행 경로', '없어도 OSRM(실제 도로망)으로 돕니다'],
  ['congestionProxyToken', '혼잡도(quiet)', '중립값 0.5로 돕니다'],
  ['publicDataServiceKey', '공원·경치(scenic)', '중립값 0.5로 돕니다'],
  ['vworldKey', '그늘(shade)', '중립값 0.5로 돕니다'],
];

const missing = keys.filter(([name]) => !isSet(name));

if (missing.length > 0) {
  console.log('');
  console.log('  이 번들에서 꺼지는 것들:');
  for (const [, what, effect] of missing) {
    console.log(`    · ${what} — ${effect}`);
  }
  console.log('');
  // 이 한 줄이 이 스크립트가 존재하는 이유다. 예전엔 이 자리가 조용했다.
  console.log('  경로 좌표는 어느 쪽이든 실제 도로망에서 옵니다. 지어내지 않습니다.');
  console.log('');
}

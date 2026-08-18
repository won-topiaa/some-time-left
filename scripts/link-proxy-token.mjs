#!/usr/bin/env node
/**
 * proxy/.env의 PROXY_TOKEN을 src/config.local.ts로 옮긴다.
 *
 * 손으로 복사하면 앞뒤 공백이 딸려가거나 한 글자가 빠진다.
 * 두 파일 다 커밋되지 않으므로 비밀값이 리포지토리에 남을 일은 없다.
 *
 *   npm run link-proxy
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const envPath = join(root, 'proxy', '.env');
const configPath = join(root, 'src', 'config.local.ts');

if (!existsSync(envPath)) {
  console.error('proxy/.env가 없어요. 먼저 프록시를 설정하세요:');
  console.error('  cd proxy && npm run setup');
  process.exit(1);
}

const match = readFileSync(envPath, 'utf8').match(/^PROXY_TOKEN=(.+)$/m);
const token = match?.[1]?.trim();

if (token == null || token === '') {
  console.error('proxy/.env에 PROXY_TOKEN이 비어 있어요.');
  console.error('  cd proxy && npm run gen-token');
  process.exit(1);
}

// 없으면 만들어 둔다. 이 스크립트만 실행해도 되도록.
if (!existsSync(configPath)) {
  execFileSync(process.execPath, [join(root, 'scripts', 'ensure-local-config.mjs')], {
    stdio: 'inherit',
  });
}

const source = readFileSync(configPath, 'utf8');
const line = /congestionProxyToken:.*,/;

if (!line.test(source)) {
  console.error('src/config.local.ts에서 congestionProxyToken 줄을 찾지 못했어요.');
  console.error('  파일을 지우고 다시 실행하면 새로 만들어집니다.');
  process.exit(1);
}

writeFileSync(
  configPath,
  source.replace(line, `congestionProxyToken: ${JSON.stringify(token)} as string | null,`),
  'utf8'
);

// 토큰 자체는 찍지 않는다. 길이만 보여도 옮겨졌는지는 알 수 있다.
console.log(`src/config.local.ts에 프록시 토큰(${token.length}자)을 넣었습니다.`);
console.log('두 파일 모두 커밋되지 않습니다.');
console.log('');
console.log('확인:  npm run typecheck');

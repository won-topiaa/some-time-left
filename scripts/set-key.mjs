#!/usr/bin/env node
/**
 * 비밀값을 `src/config.local.ts`에 넣는다.
 *
 * 파일을 열어 편집하지 않아도 되도록 물어보고 대신 써 준다.
 * 입력은 화면에 찍히지 않고, 앞뒤 공백은 잘라낸다 —
 * 붙여넣다 딸려간 공백은 나중에 인증 실패로만 드러나 원인을 찾기 어렵다.
 *
 *   npm run set-key tmap
 *   npm run set-key            ← 목록에서 고르기
 */

import { createInterface } from 'node:readline';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const configPath = join(root, 'src', 'config.local.ts');

const KEYS = [
  { name: 'tmap', field: 'tmapAppKey', label: 'TMAP appKey', where: 'openapi.sk.com → 대시보드 → 앱' },
  { name: 'proxy', field: 'congestionProxyToken', label: '프록시 토큰', where: 'proxy/.env (npm run link-proxy 권장)' },
  { name: 'publicdata', field: 'publicDataServiceKey', label: '공공데이터 인증키', where: 'data.go.kr → 마이페이지 (Decoding 키)' },
  { name: 'vworld', field: 'vworldKey', label: '브이월드 키', where: 'vworld.kr → 오픈API 인증키' },
];

if (!existsSync(configPath)) {
  execFileSync(process.execPath, [join(root, 'scripts', 'ensure-local-config.mjs')], {
    stdio: 'inherit',
  });
}

const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(question) {
  return new Promise((resolve) => rl.question(question, (a) => resolve(a.trim())));
}

/** 화면에 찍히지 않게 받는다. */
function askSecret(question) {
  return new Promise((resolve) => {
    let muted = false;
    const original = rl._writeToOutput.bind(rl);
    rl._writeToOutput = (chunk) => {
      if (!muted) {
        original(chunk);
      }
    };
    rl.question(question, (answer) => {
      rl._writeToOutput = original;
      process.stdout.write('\n');
      resolve(answer.trim());
    });
    muted = true;
  });
}

function currentValue(source, field) {
  const match = source.match(new RegExp(`${field}:\\s*(.+?),`));
  const raw = match?.[1]?.trim();
  if (raw == null || raw.startsWith('null')) {
    return null;
  }
  const quoted = raw.match(/^["'](.*)["']/);
  return quoted?.[1] ?? raw;
}

let target = KEYS.find((k) => k.name === process.argv[2]);

if (target == null) {
  const source = readFileSync(configPath, 'utf8');
  console.log('어떤 키를 넣을까요?\n');
  KEYS.forEach((key, i) => {
    const value = currentValue(source, key.field);
    const state = value == null ? '없음' : `들어감 (${value.length}자)`;
    console.log(`  ${i + 1}. ${key.label.padEnd(16)} ${state}`);
    console.log(`     ${key.where}`);
  });
  console.log('');

  const answer = await ask('번호: ');
  target = KEYS[Number(answer) - 1];

  if (target == null) {
    console.error('1~4 중에서 골라주세요.');
    rl.close();
    process.exit(1);
  }
  console.log('');
}

console.log(`${target.label}를 붙여넣으세요. (${target.where})`);
console.log('(입력은 화면에 보이지 않습니다)\n');

const value = await askSecret(`${target.label}: `);
rl.close();

if (value === '') {
  console.error('값이 비어 있어요.');
  process.exit(1);
}

const source = readFileSync(configPath, 'utf8');
const line = new RegExp(`${target.field}:.*,`);

if (!line.test(source)) {
  console.error(`src/config.local.ts에서 ${target.field} 줄을 찾지 못했어요.`);
  console.error('  파일을 지우고 다시 실행하면 새로 만들어집니다.');
  process.exit(1);
}

writeFileSync(
  configPath,
  source.replace(line, `${target.field}: ${JSON.stringify(value)} as string | null,`),
  'utf8'
);

console.log(`${target.label}(${value.length}자)를 넣었습니다. 이 파일은 커밋되지 않습니다.`);
console.log('');
console.log('확인:  npm run check-config');

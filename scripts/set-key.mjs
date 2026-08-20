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
  { name: 'publicdata', field: 'publicDataServiceKey', label: '공공데이터 인증키', where: 'data.go.kr → 마이페이지 → 일반 인증키 **(Decoding)**' },
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

let value = await askSecret(`${target.label}: `);
rl.close();

if (value === '') {
  console.error('값이 비어 있어요.');
  process.exit(1);
}

/*
 * 공공데이터포털은 같은 키를 두 벌로 보여준다 — Encoding(%2F·%2B·%3D로 바뀐 것)과
 * Decoding(원래 문자 그대로). 우리 코드는 `URLSearchParams`로 주소를 만들기 때문에
 * 넘겨준 값을 **한 번 더** 인코딩한다. Encoding 키를 넣으면 %2F가 %252F가 되어
 * 서버는 등록되지 않은 키라고 답한다.
 *
 * 포털에서 Decoding 키를 다시 찾아오게 하지 않는다. 둘은 정확히
 * `encodeURIComponent` 한 번 차이라서 여기서 되돌릴 수 있다.
 * 다만 **되돌린 것이 원래 값과 정확히 맞아떨어질 때만** 그렇게 하고,
 * 무엇을 했는지 화면에 말한다 — 조용히 값을 바꾸는 건 나중에 원인을 못 찾게 만든다.
 */
if (target.name === 'publicdata' && /%2[FB]|%3D/i.test(value)) {
  let decoded = null;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    decoded = null;
  }

  if (decoded != null && encodeURIComponent(decoded) === value) {
    value = decoded;
    console.log('Encoding 키를 받아서 Decoding 형태로 바꿨어요.');
    console.log('  (%2F → /, %2B → +, %3D → =. 우리 코드가 주소를 만들 때');
    console.log('   한 번 더 인코딩하기 때문에 이 형태여야 합니다)');
    console.log('');
  } else {
    console.error('Encoding 키로 보이는데 되돌리지 못했어요.');
    console.error('  포털의 같은 자리에 있는 Decoding 키를 넣어 주세요.');
    console.error('  (/ 와 + 와 = 가 그대로 보이는 쪽입니다)');
    process.exit(1);
  }
}

/*
 * 잘린 붙여넣기를 잡는다.
 *
 * 입력이 화면에 안 찍히므로 한두 글자가 빠져도 눈으로는 모른다. 그러면
 * "등록되지 않은 키"로 돌아오는데, 키를 잘못 받은 줄 알고 포털만 다시 뒤지게 된다.
 * data.go.kr 일반 인증키는 64바이트를 base64로 담아 88자다 — 다르면 말해 준다.
 * 막지는 않는다. 포털이 형식을 바꿀 수도 있고, 그때 못 넣게 되는 게 더 나쁘다.
 */
if (target.name === 'publicdata' && value.length !== 88) {
  console.log(`⚠ 보통 88자인데 ${value.length}자예요. 붙여넣다 잘렸을 수 있어요.`);
  console.log('  그대로 넣습니다. 안 되면 npm run check-config가 알려줘요.');
  console.log('');
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

#!/usr/bin/env node
/**
 * .env 만들기.
 *
 * 파일을 직접 열어 편집하지 않아도 되도록 물어보고 대신 써 준다.
 * PROXY_TOKEN은 자동으로 만든다 — 사람이 고민할 값이 아니다.
 *
 *   npm run setup
 */

import { createInterface } from 'node:readline';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { requireNode } from './require-node.mjs';

requireNode();

const ENV_PATH = join(dirname(dirname(fileURLToPath(import.meta.url))), '.env');

const rl = createInterface({ input: process.stdin, output: process.stdout });

/** 화면에 찍히지 않게 받는다. 어깨너머로도 안 보이도록. */
function askSecret(question) {
  return new Promise((resolve) => {
    let muted = false;
    const original = rl._writeToOutput.bind(rl);
    rl._writeToOutput = (chunk) => {
      // 질문은 그대로 보여주고, 입력만 가린다.
      if (muted) {
        return;
      }
      original(chunk);
    };

    rl.question(question, (answer) => {
      rl._writeToOutput = original;
      process.stdout.write('\n');
      resolve(answer.trim());
    });
    muted = true;
  });
}

function ask(question) {
  return new Promise((resolve) => rl.question(question, (a) => resolve(a.trim())));
}

console.log('서울 인구데이터 프록시 설정\n');

if (existsSync(ENV_PATH)) {
  const existing = readFileSync(ENV_PATH, 'utf8');
  const hasKey = /^SEOUL_OPEN_DATA_KEY=.+/m.test(existing);
  console.log(`.env가 이미 있어요${hasKey ? ' (인증키도 들어 있음)' : ''}.`);

  const overwrite = await ask('덮어쓸까요? (y/N) ');
  if (overwrite.toLowerCase() !== 'y') {
    console.log('그대로 두었습니다.');
    rl.close();
    process.exit(0);
  }
  console.log('');
}

console.log('서울 열린데이터광장 인증키를 붙여넣으세요.');
console.log('(입력은 화면에 보이지 않습니다)\n');

const key = await askSecret('인증키: ');

if (key === '') {
  console.error('인증키가 비어 있어요. 다시 실행해 주세요.');
  rl.close();
  process.exit(1);
}

// 사람이 정할 이유가 없는 값이라 그냥 만든다.
const token = randomBytes(32).toString('base64url');

writeFileSync(
  ENV_PATH,
  [
    '# 서울 인구데이터 프록시 설정. 이 파일은 커밋되지 않습니다.',
    `SEOUL_OPEN_DATA_KEY=${key}`,
    `PROXY_TOKEN=${token}`,
    '',
  ].join('\n'),
  { mode: 0o600 }
);

rl.close();

console.log(`.env를 만들었습니다. (${ENV_PATH})`);
console.log(`인증키 ${key.length}자, 접근 토큰 자동 생성 완료.\n`);
console.log('앱에 넣을 토큰 (src/_app.tsx):');
console.log(`  congestionProxy: { baseUrl: '...', token: '${token}' }\n`);
console.log('다음:  npm run check   ← 인증키가 살아 있는지 확인');

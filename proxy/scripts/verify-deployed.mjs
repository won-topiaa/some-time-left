#!/usr/bin/env node
/**
 * 배포된 프록시 확인.
 *
 * `/health`는 코드가 살아 있는지만 본다. 진짜 관문은 `/population`이다 —
 * Workers가 서울의 평문 HTTP(8088 포트)로 나갈 수 있는지가 여기서 드러난다.
 *
 *   npm run verify
 *   npm run verify -- https://다른-주소
 *
 * 토큰은 .env에서 읽고 출력에 찍지 않는다.
 */

import { requireNode } from './require-node.mjs';

requireNode();

const DEFAULT_URL = 'https://some-time-left-proxy.yangjuwon240.workers.dev';
const baseUrl = (process.argv[2] ?? process.env.PROXY_URL ?? DEFAULT_URL).replace(/\/$/, '');
const token = process.env.PROXY_TOKEN;

if (token == null || token === '') {
  console.error('PROXY_TOKEN이 없어요. proxy/.env에 있어야 합니다.');
  process.exit(1);
}

const AREAS = ['강남역', '홍대 관광특구'];

console.log(`대상: ${baseUrl}\n`);

// 1. 코드가 살아 있는가
let health;
try {
  health = await fetch(`${baseUrl}/health`);
} catch (error) {
  console.log(`✗ 연결 실패 — ${error.message}`);
  console.log('  주소가 맞는지, 배포가 됐는지 확인하세요.');
  process.exit(1);
}

const healthText = await health.text();

if (!health.ok) {
  // 설정 오류면 프록시가 무엇이 빠졌는지 알려준다. 그대로 보여주는 게 낫다.
  console.log(`✗ /health  ${health.status}`);
  console.log(`  ${healthText.slice(0, 300)}`);
  console.log('');
  console.log('  시크릿이 안 붙었을 수 있어요:  npx wrangler secret list');
  process.exit(1);
}

console.log(`✓ /health  ${healthText}`);

// 2. 서울까지 실제로 닿는가
const params = new URLSearchParams();
for (const area of AREAS) {
  params.append('area', area);
}

const response = await fetch(`${baseUrl}/population?${params}`, {
  headers: { Authorization: `Bearer ${token}` },
});

if (response.status === 401) {
  console.log('\n✗ 401 — 토큰이 안 맞아요.');
  console.log('  .env의 PROXY_TOKEN과 Workers에 넣은 값이 같은지 확인하세요:');
  console.log('    npx wrangler secret list');
  process.exit(1);
}

if (!response.ok) {
  console.log(`\n✗ ${response.status} — ${(await response.text()).slice(0, 200)}`);
  process.exit(1);
}

const body = await response.json();
const areas = body.areas ?? [];

if (areas.length === 0) {
  console.log('\n✗ /population이 빈 목록이에요.');
  console.log('  Workers에서 서울의 평문 HTTP(8088) 아웃바운드가 막힌 것으로 보입니다.');
  console.log('  로컬(npm run check)은 되는데 여기서만 비면 거의 확실합니다.');
  console.log('');
  console.log('  해결: Node 버전을 Fly나 Railway에 올리세요. 핸들러가 같아 코드 변경은 없습니다.');
  console.log('    npm run build && npm start   ← 먼저 로컬에서 서버로도 되는지 확인');
  process.exit(1);
}

console.log('');
for (const area of areas) {
  const when = area.updatedAt != null ? ` (${area.updatedAt})` : '';
  console.log(`  ✓ ${String(area.areaName).padEnd(16)} ${area.level}${when}`);
}

console.log('');
console.log(`${areas.length}/${AREAS.length}곳 확인. 프록시가 끝까지 동작합니다.`);
console.log('');
console.log('남은 것: src/_app.tsx의 congestionProxy.token에 PROXY_TOKEN을 넣으면');
console.log('앱에서 quiet이 실제 데이터로 계산됩니다. (커밋하지 마세요)');

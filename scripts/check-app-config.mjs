#!/usr/bin/env node
/**
 * 앱 설정이 실제로 동작하는지 확인.
 *
 * `npm run typecheck`는 문법만 본다 — 토큰이 null이어도 통과한다.
 * 여기서는 값이 들어갔는지 보고, 프록시 토큰은 **실제로 호출해서** 확인한다.
 *
 *   npm run check-config
 *
 * 비밀값은 출력하지 않는다. 들어갔는지와 길이만 보여준다.
 */

import { requireNode } from '../proxy/scripts/require-node.mjs';

requireNode();

const { getApiConfig, configureApi } = await import('../src/config.ts');
const { localSecrets } = await import('../src/config.local.ts');

// 앱이 시작할 때 하는 것과 같은 주입.
configureApi({
  tmap: { appKey: localSecrets.tmapAppKey },
  congestionProxy: { token: localSecrets.congestionProxyToken },
  publicData: { serviceKey: localSecrets.publicDataServiceKey },
  vworld: { key: localSecrets.vworldKey },
});

const config = getApiConfig();

function mark(value) {
  return value == null || value === '' ? '✗ 없음' : `✓ 들어감 (${String(value).length}자)`;
}

console.log('설정 상태\n');
console.log(`  TMAP appKey        ${mark(config.tmap.appKey)}   → 없으면 경로가 mock`);
console.log(`  프록시 토큰         ${mark(config.congestionProxy.token)}   → 없으면 quiet 중립값`);
console.log(`  공공데이터 인증키    ${mark(config.publicData.serviceKey)}   → 없으면 scenic 중립값`);
console.log(`  브이월드 키         ${mark(config.vworld.key)}   → 없으면 shade 기본 높이`);
console.log(`\n  프록시 주소         ${config.congestionProxy.baseUrl ?? '(없음)'}`);

const token = config.congestionProxy.token;
const baseUrl = config.congestionProxy.baseUrl;

if (token == null || baseUrl == null) {
  console.log('\n프록시 토큰이 없어 실제 호출은 건너뜁니다.');
  console.log('  npm run link-proxy   ← proxy/.env에서 가져다 넣어요');
  process.exit(0);
}

// 여기가 진짜 확인. 앱이 쓸 값 그대로 프록시를 부른다.
console.log('\n앱 설정 그대로 프록시를 불러봅니다...');

const params = new URLSearchParams();
params.append('area', '강남역');

let response;
try {
  response = await fetch(`${baseUrl}/population?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
} catch (error) {
  console.log(`✗ 연결 실패 — ${error.message}`);
  process.exit(1);
}

if (response.status === 401) {
  console.log('✗ 401 — 앱의 토큰이 프록시와 맞지 않아요.');
  console.log('  npm run link-proxy 로 다시 넣어보세요.');
  process.exit(1);
}

if (!response.ok) {
  console.log(`✗ ${response.status} — ${(await response.text()).slice(0, 200)}`);
  process.exit(1);
}

const areas = (await response.json()).areas ?? [];

if (areas.length === 0) {
  console.log('✗ 응답이 비었어요. 프록시가 서울까지 못 닿는 상태입니다.');
  console.log('  cd proxy && npm run verify 로 프록시 쪽을 확인하세요.');
  process.exit(1);
}

for (const area of areas) {
  console.log(`✓ ${area.areaName} — ${area.level}`);
}

console.log('\n앱이 쓸 설정으로 실제 데이터가 옵니다. quiet은 이제 진짜 값입니다.');

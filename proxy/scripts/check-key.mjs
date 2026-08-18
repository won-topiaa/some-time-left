#!/usr/bin/env node
/**
 * 서울 인증키 확인.
 *
 * 서버를 띄우지 않고, 프록시가 실제로 쓰는 코드 경로(fetchPopulation)로
 * 몇 곳을 조회해 본다. 키가 살아 있는지, 응답이 우리 파서와 맞는지 한 번에 본다.
 *
 *   npm run check
 *
 * 인증키는 출력에 찍히지 않는다.
 */

import { requireNode } from './require-node.mjs';

// 버전 확인이 먼저다. .ts를 정적으로 import하면 낮은 버전에서 이 줄 전에 터진다.
requireNode();

const { fetchPopulation } = await import('../src/seoul.ts');

const key = process.env.SEOUL_OPEN_DATA_KEY;

if (key == null || key === '') {
  console.error('SEOUL_OPEN_DATA_KEY가 없어요.');
  console.error('  cp .env.example .env  후 채우고 다시 실행하세요.');
  process.exit(1);
}

const upstream = {
  baseUrl: process.env.SEOUL_BASE_URL ?? 'http://openapi.seoul.go.kr:8088',
  key,
};

// 샘플 키로도 열리는 곳부터, 정식 키라야 열리는 곳까지 섞어서 본다.
const AREAS = ['광화문·덕수궁', '강남역', '홍대 관광특구', '성수카페거리'];

console.log(`업스트림: ${upstream.baseUrl}`);
console.log(`${AREAS.length}곳 조회합니다.\n`);

let ok = 0;

for (const area of AREAS) {
  const result = await fetchPopulation(upstream, area, 8000);

  if (result == null) {
    console.log(`  ✗ ${area.padEnd(16)} 응답 없음`);
    continue;
  }
  ok += 1;
  const when = result.updatedAt != null ? ` (${result.updatedAt})` : '';
  console.log(`  ✓ ${result.areaName.padEnd(16)} ${result.level}${when}`);
}

console.log('');

if (ok === 0) {
  console.log('한 곳도 못 읽었습니다. 확인할 것:');
  console.log('  · 발급 직후라면 몇 분 뒤 다시 (키 반영에 시간이 걸립니다)');
  console.log('  · 인증키를 그대로 복사했는지 (앞뒤 공백 주의)');
  console.log('  · 네트워크가 평문 HTTP(8088 포트)를 막고 있지 않은지');
  process.exit(1);
}

if (ok < AREAS.length) {
  console.log(`${ok}/${AREAS.length}곳 성공. 일부만 되는 건 보통 정상입니다 —`);
  console.log('샘플 키는 광화문·덕수궁만 열리고, 장소명이 정확히 일치해야 합니다.');
} else {
  console.log('전부 성공. 프록시를 띄워도 좋습니다:  npm run dev');
}

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

// 값이 들어갔는지 보는 것으로는 부족하다. 실제로 불러봐야 안다.
console.log('\n실제로 불러봅니다\n');

const failures = [];

/**
 * JSON으로 읽되, 아니면 무엇이 왔는지 보여준다.
 * 네트워크나 프록시 문제일 때 "Unexpected token 'H'" 같은 메시지는 원인을 가린다.
 */
async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`JSON이 아닌 응답 (${response.status}): ${text.slice(0, 100)}`);
  }
}

async function probe(label, run) {
  if (run == null) {
    console.log(`  – ${label.padEnd(18)} 키가 없어 건너뜀`);
    return;
  }
  try {
    const message = await run();
    console.log(`  ✓ ${label.padEnd(18)} ${message}`);
  } catch (error) {
    console.log(`  ✗ ${label.padEnd(18)} ${error.message}`);
    failures.push(label);
  }
}

// 1. 혼잡도 프록시 — 앱이 쓸 값 그대로
const { token, baseUrl } = config.congestionProxy;
await probe(
  '혼잡도 프록시',
  token == null || baseUrl == null
    ? null
    : async () => {
        const response = await fetch(`${baseUrl}/population?area=${encodeURIComponent('강남역')}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.status === 401) {
          throw new Error('401 — 토큰이 프록시와 안 맞아요 (npm run link-proxy)');
        }
        if (!response.ok) {
          throw new Error(`${response.status} — ${(await response.text()).slice(0, 120)}`);
        }
        const areas = (await readJson(response)).areas ?? [];
        if (areas.length === 0) {
          throw new Error('응답이 비었어요 (cd proxy && npm run verify)');
        }
        return `강남역 ${areas[0].level}`;
      }
);

// 2. TMAP — 경로·검색·지오코딩이 모두 이 키를 쓴다
const appKey = config.tmap.appKey;
await probe(
  'TMAP 장소검색',
  appKey == null
    ? null
    : async () => {
        const url = `${config.tmap.baseUrl}/tmap/pois?version=1&searchKeyword=${encodeURIComponent('서울숲')}&count=1&resCoordType=WGS84GEO&searchType=all`;
        const response = await fetch(url, { headers: { appKey, Accept: 'application/json' } });
        const body = await readJson(response);
        const code = body?.error?.code;
        if (code === 'INVALID_API_KEY') {
          throw new Error('키가 유효하지 않아요');
        }
        if (code != null) {
          throw new Error(code);
        }
        const count = body?.searchPoiInfo?.pois?.poi?.length ?? 0;
        return `${count}건 조회됨`;
      }
);

// 3. TMAP Puzzle — 같은 키지만 상품 사용 신청이 따로 필요하다
await probe(
  '장소 혼잡도',
  appKey == null
    ? null
    : async () => {
        const response = await fetch(`${config.tmap.baseUrl}/puzzle/place/meta/pois?offset=0&limit=1`, {
          headers: { appKey, Accept: 'application/json' },
        });
        const body = await readJson(response);
        if (body?.error?.code != null) {
          throw new Error(`${body.error.code} — 상품 사용 신청이 필요할 수 있어요`);
        }
        return `제공 장소 ${body?.status?.totalCount ?? '?'}곳`;
      }
);

// 4. 공공데이터포털 — 공원 표준데이터
const serviceKey = config.publicData.serviceKey;
await probe(
  '공공데이터 공원',
  serviceKey == null
    ? null
    : async () => {
        const params = new URLSearchParams({
          serviceKey,
          pageNo: '1',
          numOfRows: '1',
          type: 'json',
        });
        const response = await fetch(
          `${config.publicData.baseUrl}${config.publicData.parkPath}?${params}`
        );
        const text = await response.text();
        if (text.includes('SERVICE_KEY_IS_NOT_REGISTERED')) {
          throw new Error('키가 등록되지 않았어요 (Decoding 키인지 확인)');
        }
        if (text.includes('NO_OPENAPI_SERVICE_ERROR')) {
          throw new Error('서비스 경로가 바뀌었어요 (config.ts의 parkPath)');
        }
        return '응답 정상';
      }
);

// 5. 브이월드 — 건물 레이어. 레이어 아이디가 맞는지도 여기서 드러난다
const vworldKey = config.vworld.key;
await probe(
  '브이월드 건물',
  vworldKey == null
    ? null
    : async () => {
        const params = new URLSearchParams({
          service: 'data',
          request: 'GetFeature',
          data: config.vworld.buildingLayer,
          key: vworldKey,
          format: 'json',
          size: '1',
          geomFilter: 'BOX(127.025,37.496,127.030,37.500)',
        });
        const response = await fetch(`${config.vworld.baseUrl}?${params}`);
        const text = await response.text();
        if (response.status >= 500) {
          throw new Error(`브이월드가 ${response.status} — 서비스 장애일 수 있어요`);
        }
        const body = JSON.parse(text);
        const status = body?.response?.status;
        if (status !== 'OK') {
          throw new Error(`status=${status} — 레이어 아이디나 도메인 등록을 확인하세요`);
        }
        const count = body?.response?.result?.featureCollection?.features?.length ?? 0;
        return count > 0 ? `건물 ${count}건 (레이어 아이디 확인됨)` : '응답은 왔으나 건물 없음';
      }
);

console.log('');

if (failures.length > 0) {
  console.log(`${failures.length}개가 실패했어요: ${failures.join(', ')}`);
  process.exit(1);
}

console.log('설정한 것은 모두 실제로 동작합니다.');

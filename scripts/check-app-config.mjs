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

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { requireNode } from '../proxy/scripts/require-node.mjs';

requireNode();

/**
 * 출시에 필요한 것이 실제로 준비됐는가.
 *
 * typecheck와 테스트는 둘 다 통과해도 배포 직전에야 드러나는 구멍들이라
 * 네트워크 확인보다 먼저 본다.
 */
const iconPath = new URL('../assets/icon.png', import.meta.url);
const hasIcon = existsSync(iconPath);
console.log(`아이콘 그림          ${hasIcon ? '✓ assets/icon.png 있음' : '✗ 없음'}`);
if (!hasIcon) {
  console.log('  → python3 scripts/make-icon.py 로 만드세요.');
}

// brand.icon은 파일 경로가 아니라 이미지 **주소**다. 프레임워크가 그대로
// <Image source={{ uri }} />에 넘기므로 상대 경로를 넣으면 영영 안 뜬다.
const graniteConfig = readFileSync(new URL('../granite.config.ts', import.meta.url), 'utf8');
const iconValue = graniteConfig.match(/icon:\s*'([^']*)'/)?.[1] ?? '';
const iconIsUrl = /^https?:\/\//.test(iconValue);
const iconIsPath = iconValue !== '' && !iconIsUrl;

console.log(
  `brand.icon           ${
    iconIsUrl ? '✓ 주소 들어감' : iconIsPath ? '✗ 파일 경로 (주소여야 함)' : '– 아직 비어 있음'
  }`
);
if (iconIsPath) {
  console.log("  → 상대 경로는 렌더링되지 않아요. 콘솔에 올린 이미지 주소를 넣으세요.");
} else if (!iconIsUrl) {
  console.log('  → 배포 전에 앱인토스 콘솔에 아이콘을 올리고 그 주소를 넣으세요.');
}
/**
 * 콘솔 '노출 정보'에 올릴 그림들이 요구한 크기 그대로인가.
 *
 * 크기가 1px만 달라도 업로드에서 되돌려 보낸다. 콘솔 앞에서 알게 되는 것보다
 * 여기서 아는 편이 낫다. PNG 헤더만 읽으면 되므로 의존성은 필요 없다.
 */
function pngSize(file) {
  const head = readFileSync(file).subarray(0, 24);
  // 8바이트 시그니처 + 길이(4) + 'IHDR'(4) 다음이 가로·세로.
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}

/**
 * 터미널에서 한글은 두 칸을 차지한다. `padEnd`는 글자 수만 세므로
 * 한글이 섞인 라벨끼리는 줄이 안 맞는다 — 폭으로 세서 맞춘다.
 */
function pad(label, width = 18) {
  const cols = [...label].reduce((n, c) => n + (c.charCodeAt(0) > 0x1100 ? 2 : 1), 0);
  return label + ' '.repeat(Math.max(1, width - cols));
}

function checkImage(label, relative, want) {
  const file = new URL(`../${relative}`, import.meta.url);
  if (!existsSync(file)) {
    console.log(`${pad(label)} ✗ ${relative} 없음`);
    return false;
  }
  const { width, height } = pngSize(file);
  const ok = width === want.width && height === want.height;
  console.log(
    `${pad(label)} ${ok ? '✓' : '✗'} ${width}x${height}` +
      (ok ? '' : ` (${want.width}x${want.height}이어야 해요)`)
  );
  return ok;
}

console.log('');
console.log('콘솔에 올릴 그림\n');

const storeChecks = [
  checkImage('  앱 로고', 'assets/logo-600.png', { width: 600, height: 600 }),
  checkImage('  다크모드 로고', 'assets/logo-600-dark.png', { width: 600, height: 600 }),
];

// 세로형 최소 3장, 가로형 최소 1장.
const storeDir = new URL('../assets/store/', import.meta.url);
const shots = existsSync(storeDir)
  ? readdirSync(storeDir)
      .filter((f) => f.endsWith('.png'))
      .map((f) => ({ name: f, ...pngSize(new URL(f, storeDir)) }))
  : [];
const portrait = shots.filter((s) => s.width === 636 && s.height === 1048).length;
const landscape = shots.filter((s) => s.width === 1504 && s.height === 741).length;

console.log(`${pad('  세로 스크린샷')} ${portrait >= 3 ? '✓' : '✗'} ${portrait}장 (636x1048, 최소 3장)`);
console.log(`${pad('  가로 스크린샷')} ${landscape >= 1 ? '✓' : '✗'} ${landscape}장 (1504x741, 최소 1장)`);

const odd = shots.filter(
  (s) => !(s.width === 636 && s.height === 1048) && !(s.width === 1504 && s.height === 741)
);
for (const s of odd) {
  console.log(`  ${s.name.padEnd(16)} ◦ ${s.width}x${s.height} — 규격 밖이라 안 세었어요`);
}

const storeOk = storeChecks.every(Boolean) && portrait >= 3 && landscape >= 1;
if (!storeOk) {
  console.log('  → python3 scripts/make-icon.py && npm run store-shots');
}

console.log('');

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

if (!hasIcon) {
  failures.push('아이콘 그림 assets/icon.png이 없어요 — python3 scripts/make-icon.py');
}
if (iconIsPath) {
  failures.push('granite.config.ts의 brand.icon이 파일 경로예요 — 이미지 주소여야 렌더링됩니다');
}
if (!storeOk) {
  failures.push('콘솔에 올릴 로고나 스크린샷이 규격에 안 맞아요');
}

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

/**
 * @param {string} label
 * @param {(() => Promise<string>) | null} run  키가 없으면 null
 * @param {{ optional?: boolean }} [opts]  선택 기능은 실패해도 전체를 실패로 치지 않는다
 */
async function probe(label, run, opts = {}) {
  if (run == null) {
    console.log(`  – ${label.padEnd(18)} 키가 없어 건너뜀`);
    return;
  }
  try {
    const message = await run();
    console.log(`  ✓ ${label.padEnd(18)} ${message}`);
  } catch (error) {
    if (opts.optional === true) {
      // 선택 기능(예: 별도 상품)이 안 된 것은 고장이 아니다. 참고로만 보여준다.
      console.log(`  ◦ ${label.padEnd(18)} ${error.message} (선택 기능)`);
      return;
    }
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

// 3. TMAP Puzzle — TMAP과 별개 상품이다. 목적지 붐빔 한 줄용 선택 기능.
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
          throw new Error(`${body.error.code} — Puzzle 상품 미신청`);
        }
        return `제공 장소 ${body?.status?.totalCount ?? '?'}곳`;
      },
  { optional: true }
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

// 5. 앱 아이콘 — 주소가 실제로 이미지를 주는지. 안 뜨는 아이콘은 배포하고 나서야 보인다.
await probe(
  '앱 아이콘 주소',
  !iconIsUrl
    ? null
    : async () => {
        const response = await fetch(iconValue).catch(() => {
          throw new Error('주소에 닿지 못했어요 (네트워크나 방화벽 확인)');
        });
        if (response.status === 404) {
          throw new Error('404 — 프록시를 다시 배포했나요? (cd proxy && npm run deploy)');
        }
        if (!response.ok) {
          throw new Error(`${response.status} — 주소가 응답하지 않아요`);
        }
        const type = response.headers.get('content-type') ?? '';
        if (!type.startsWith('image/')) {
          throw new Error(`이미지가 아니에요 (${type || '타입 없음'})`);
        }
        const bytes = (await response.arrayBuffer()).byteLength;
        return `${type} ${(bytes / 1024).toFixed(0)}KB`;
      }
);

// 6. 브이월드 — 건물 레이어. 레이어 아이디가 맞는지도 여기서 드러난다
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
          domain: config.vworld.domain,
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

/*
 * 키가 하나도 없으면 "실패 0건"이 되어 전부 통과한 것처럼 보인다.
 * 확인할 게 없었던 것과 확인해서 괜찮은 것은 다르다 — 배포 전 점검이
 * 아무것도 설정 안 된 상태를 초록불로 알려 주면 그게 제일 나쁘다.
 */
const configured = [
  config.tmap.appKey,
  config.congestionProxy.token,
  config.publicData.serviceKey,
  config.vworld.key,
].filter((value) => value != null && value !== '').length;

if (configured === 0) {
  console.log('키가 하나도 없어요 — 확인한 게 없습니다.');
  console.log('  → npm run set-key 로 넣고 다시 실행하세요.');
  process.exit(1);
}

console.log(`설정한 ${configured}개는 모두 실제로 동작합니다.`);
console.log('◦ 표시는 선택 기능이라 없어도 앱은 완전합니다.');
if (!iconIsUrl) {
  console.log('※ brand.icon은 아직 비어 있어요. 배포 전에 아이콘 주소를 넣으세요.');
}

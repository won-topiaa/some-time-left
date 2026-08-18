#!/usr/bin/env node
/**
 * 브이월드 건물 레이어 아이디와 층수 속성명을 찾아낸다.
 *
 * 문서를 뒤지는 것보다 실제 응답을 보는 쪽이 확실하다.
 * 후보 레이어를 하나씩 호출해서, 응답이 오는 레이어의 속성 이름을 전부 출력한다.
 *
 *   node scripts/discover-vworld.mjs <VWORLD_KEY> [레이어아이디]
 *
 * 레이어 아이디를 직접 주면 그 레이어만 조회해 속성을 보여준다.
 * 찾은 값은 src/config.ts의 vworld.buildingLayer / vworld.floorField에 넣는다.
 *
 * 브이월드는 등록 도메인을 요청에 실어야 한다. 기본은 config.ts의 프록시 도메인과
 * 같은 값이며, 다른 도메인을 등록했다면 VWORLD_DOMAIN 환경변수로 바꾼다.
 *   VWORLD_DOMAIN=localhost node scripts/discover-vworld.mjs <KEY>
 */

let KEY = process.argv[2];
const ONLY = process.argv[3];
let DOMAIN = process.env.VWORLD_DOMAIN;

// 키를 인자로 안 주면 저장된 키(config.local.ts)를 읽는다 — 셸 기록에 키가 안 남는다.
// 이 경로는 `npm run vworld-layers`로 실행해야 한다(.ts를 읽으려면 타입 스트립 필요).
if (KEY == null || KEY === '') {
  try {
    const { localSecrets } = await import('../src/config.local.ts');
    KEY = localSecrets.vworldKey ?? '';
    if (DOMAIN == null) {
      const { getApiConfig } = await import('../src/config.ts');
      DOMAIN = getApiConfig().vworld.domain;
    }
  } catch {
    // 플래그 없이 실행돼 .ts를 못 읽으면 아래 사용법 안내로 떨어진다.
  }
}
DOMAIN = DOMAIN ?? 'some-time-left-proxy.yangjuwon240.workers.dev';

if (KEY == null || KEY === '') {
  console.error('사용법: npm run vworld-layers            (저장된 키 사용)');
  console.error('   또는: node scripts/discover-vworld.mjs <VWORLD_KEY> [레이어아이디]');
  process.exit(1);
}

/** 건물 레이어일 법한 후보들. 맞는 게 없으면 브이월드 레이어 목록에서 찾아 인자로 넘긴다. */
const CANDIDATES = [
  'LT_C_SPBD',
  'LT_C_BULD',
  'LT_C_BLDG',
  'LT_L_SPBD',
  'LP_PA_CBND_BUBUN',
];

/** 층수일 법한 속성 이름들. 아래 목록에 없으면 전체 속성을 보고 고른다. */
const FLOOR_HINTS = ['gro_flo_co', 'grnd_flr', 'flr_cnt', 'floor', 'layer', 'bldg_flr', 'ground'];

// 서울 강남역 근처 작은 상자. 건물이 반드시 있는 곳이라 비면 레이어가 틀린 것이다.
const BOX = 'BOX(127.025,37.496,127.030,37.500)';

async function probe(layer) {
  const params = new URLSearchParams({
    service: 'data',
    request: 'GetFeature',
    data: layer,
    key: KEY,
    domain: DOMAIN,
    format: 'json',
    geometry: 'true',
    size: '3',
    geomFilter: BOX,
  });

  const url = `https://api.vworld.kr/req/data?${params}`;

  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    return { layer, ok: false, reason: `연결 실패: ${error.message}` };
  }

  const text = await response.text();

  // 브이월드 서버가 통째로 죽으면 모든 경로가 502를 뱉는다. 레이어 문제와 구분한다.
  if (response.status >= 500) {
    return {
      layer,
      ok: false,
      fatal: true,
      reason: `브이월드 서버가 ${response.status}를 반환. 레이어 아이디 문제가 아니라 서비스 장애일 수 있다.`,
    };
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return { layer, ok: false, reason: `JSON 아님 (${response.status}): ${text.slice(0, 120)}` };
  }

  const status = json?.response?.status;
  if (status !== 'OK') {
    const message =
      json?.response?.error?.text ?? json?.response?.error?.code ?? status ?? '알 수 없음';
    return { layer, ok: false, reason: `status=${status} ${message}` };
  }

  const features = json?.response?.result?.featureCollection?.features ?? [];
  if (features.length === 0) {
    return { layer, ok: false, reason: '응답은 왔으나 이 영역에 건물이 없음' };
  }

  return { layer, ok: true, properties: features[0].properties ?? {} };
}

function report({ layer, properties }) {
  console.log(`\n✅ ${layer} — 건물 ${Object.keys(properties).length}개 속성`);
  console.log('─'.repeat(60));

  const entries = Object.entries(properties);
  const numericFields = [];

  for (const [name, value] of entries) {
    const numeric = Number(value);
    const looksNumeric = Number.isFinite(numeric) && value !== '' && value != null;
    const hinted = FLOOR_HINTS.some((h) => name.toLowerCase().includes(h));

    // 층수는 1~200 사이의 작은 정수다. 그 조건에 맞는 것만 후보로 표시한다.
    const plausibleFloor = looksNumeric && numeric >= 1 && numeric <= 200 && Number.isInteger(numeric);
    if (plausibleFloor) {
      numericFields.push({ name, value: numeric, hinted });
    }

    const mark = hinted ? ' ← 이름이 층수 같음' : plausibleFloor ? ' ← 값이 층수 같음' : '';
    console.log(`  ${name.padEnd(24)} = ${String(value).slice(0, 40)}${mark}`);
  }

  console.log('─'.repeat(60));

  const best = numericFields.find((f) => f.hinted) ?? numericFields[0];
  if (best == null) {
    console.log('층수로 보이는 속성을 못 찾았다. 위 목록에서 직접 고를 것.');
    return;
  }

  console.log('\nsrc/config.ts 에 넣을 값:');
  console.log(`  buildingLayer: '${layer}',`);
  console.log(`  floorField: '${best.name}',`);
}

const targets = ONLY != null ? [ONLY] : CANDIDATES;
console.log(`강남역 근처(${BOX})에서 ${targets.length}개 레이어를 조회합니다.\n`);

let found = false;
let fatal = false;
for (const layer of targets) {
  const result = await probe(layer);
  if (result.ok) {
    found = true;
    report(result);
  } else {
    console.log(`❌ ${layer.padEnd(20)} ${result.reason}`);
    if (result.fatal === true) {
      fatal = true;
      break;
    }
  }
}

if (fatal) {
  console.log('\n브이월드 서버 쪽 문제로 보입니다. 잠시 후 다시 시도하세요.');
  console.log('https://api.vworld.kr/req/data 를 브라우저로 열어 같은 오류가 나는지 확인하면 확실합니다.');
} else if (!found) {
  console.log('\n맞는 레이어가 없습니다. 브이월드 레이어 목록에서 건물 레이어 아이디를 찾아');
  console.log('두 번째 인자로 넘기세요:');
  console.log('  https://www.vworld.kr → 오픈API → 2D 데이터 API → 데이터 제공목록');
  console.log('  npm run vworld-layers -- <레이어아이디>   (저장된 키로 특정 레이어 조회)');
}

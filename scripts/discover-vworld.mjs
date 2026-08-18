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
 */

const KEY = process.argv[2];
const ONLY = process.argv[3];

if (KEY == null || KEY === '') {
  console.error('사용법: node scripts/discover-vworld.mjs <VWORLD_KEY> [레이어아이디]');
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
for (const layer of targets) {
  const result = await probe(layer);
  if (result.ok) {
    found = true;
    report(result);
  } else {
    console.log(`❌ ${layer.padEnd(20)} ${result.reason}`);
  }
}

if (!found) {
  console.log('\n맞는 레이어가 없습니다. 브이월드 레이어 목록에서 건물 레이어 아이디를 찾아');
  console.log('두 번째 인자로 넘기세요:');
  console.log('  https://www.vworld.kr → 오픈API → 2D 데이터 API → 데이터 제공목록');
  console.log('  node scripts/discover-vworld.mjs <KEY> <레이어아이디>');
}

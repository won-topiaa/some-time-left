#!/usr/bin/env node
/**
 * TMAP 응답 구조 확인.
 *
 * 파서 세 개(경로·지오코딩·혼잡도)가 아직 실측 없이 방어적으로만 쓰여 있다.
 * 실제 응답의 필드 이름과 타입을 알면 좁힐 수 있다.
 *
 *   npm run probe-tmap
 *
 * 키는 저장된 것(config.local.ts)을 읽는다. 명령줄에 키를 적으면 셸 기록에
 * 그대로 남아, 화면에 안 찍는다는 이 저장소의 규칙이 무색해진다.
 *
 * 출력은 **구조만** 보여준다 — 키는 절대 찍지 않고, 문자열 값은 잘라서
 * 형태만 알 수 있게 한다. 그대로 복사해서 붙여도 안전하다.
 */

let KEY = '';
try {
  const { localSecrets } = await import('../src/config.local.ts');
  KEY = localSecrets.tmapAppKey ?? '';
} catch {
  KEY = '';
}

if (KEY === '') {
  console.error('저장된 TMAP 키가 없어요.');
  console.error('  npm run set-key tmap   (입력은 화면에 안 찍혀요)');
  process.exit(1);
}

const BASE = 'https://apis.openapi.sk.com';

/** 값을 구조로 요약한다. 실제 값은 형태만 남기고 자른다. */
function describe(value, depth = 0, maxDepth = 4) {
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'array(0)';
    if (depth >= maxDepth) return `array(${value.length})`;
    // 배열은 첫 원소만 보면 구조를 안다.
    return { [`array(${value.length}) of`]: describe(value[0], depth + 1, maxDepth) };
  }
  if (typeof value === 'object') {
    if (depth >= maxDepth) return 'object';
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = describe(v, depth + 1, maxDepth);
    }
    return out;
  }
  if (typeof value === 'string') {
    // 좌표·시각처럼 형태가 중요한 값은 짧으니 그대로, 긴 건 자른다.
    return value.length <= 24 ? `string "${value}"` : `string(${value.length}) "${value.slice(0, 24)}…"`;
  }
  return `${typeof value} ${value}`;
}

async function call(label, path, init = {}) {
  const url = `${BASE}${path}`;
  process.stdout.write(`\n${'='.repeat(64)}\n${label}\n${'-'.repeat(64)}\n`);
  // 키가 섞이지 않도록 경로만 찍는다.
  console.log(`${init.method ?? 'GET'} ${path.split('?')[0]}`);

  try {
    const response = await fetch(url, {
      ...init,
      headers: { Accept: 'application/json', appKey: KEY, ...(init.headers ?? {}) },
    });

    const text = await response.text();
    console.log(`status ${response.status}`);

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      console.log(`(JSON 아님) ${text.slice(0, 200)}`);
      return;
    }

    if (!response.ok) {
      console.log(JSON.stringify(json, null, 2).slice(0, 400));
      return;
    }

    console.log(JSON.stringify(describe(json), null, 2));
  } catch (error) {
    console.log(`요청 실패: ${error.message}`);
  }
}

// 1. 보행자 경로안내 — path/거리/시간/횡단보도·계단 판별에 쓰는 필드 확인
await call(
  '1. 보행자 경로안내  (parsePedestrianResponse)',
  '/tmap/routes/pedestrian?version=1',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startX: 126.9769,
      startY: 37.5759,
      endX: 126.9779,
      endY: 37.5663,
      startName: encodeURIComponent('광화문'),
      endName: encodeURIComponent('시청'),
      reqCoordType: 'WGS84GEO',
      resCoordType: 'WGS84GEO',
      searchOption: '0',
    }),
  }
);

// 2. POI 검색 — poiId 필드 이름이 id인지 확인 (혼잡도 매칭에 쓴다)
await call(
  '2. POI 검색  (parsePoi / poiId)',
  `/tmap/pois?version=1&searchKeyword=${encodeURIComponent('서울숲')}&count=2&resCoordType=WGS84GEO&searchType=all`
);

// 3. 지오코딩 — newLat/newLon vs lat/lon 중 어느 쪽에 값이 실리는지 확인
await call(
  '3. 지오코딩  (parseFullAddrGeo)',
  `/tmap/geo/fullAddrGeo?version=1&fullAddr=${encodeURIComponent('서울시 강남구 테헤란로 152')}&coordType=WGS84GEO`
);

// 4. 혼잡도 제공 장소 목록 — 상품 사용 신청이 됐는지도 여기서 드러난다
await call('4. 혼잡도 장소 목록  (parseMetaPois)', '/puzzle/place/meta/pois?offset=0&limit=3');

// 5. 실시간 혼잡도 — 등급 필드 이름과 값 범위 확인 (롯데월드몰)
await call('5. 실시간 혼잡도  (parseCongestion)', '/puzzle/place/congestion/rltm/pois/5799875');

console.log(`\n${'='.repeat(64)}`);
console.log('위 출력을 그대로 붙여 주세요. 키는 찍히지 않았습니다.');

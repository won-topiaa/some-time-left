#!/usr/bin/env node
/**
 * 오프라인 지역 색인을 만든다 → `src/data/regions/korea.ts`
 *
 * ## 왜 있나
 *
 * 사용자가 "흑석동"을 쳤는데 아무것도 안 나왔다. 키 없는 번들의 검색은
 * Photon(OSM) → 서울 핫스팟 122곳 순이었는데, Photon은 한 번도 실측된 적이
 * 없었고 핫스팟엔 동 이름이 사실상 없다. 경로 버그와 같은 종류다 — 검증 안 된
 * 외부 의존 하나에 기대고, 그게 빠지면 바닥이 없다.
 *
 * 그래서 바닥을 깐다. 전국 읍면동·시군구·시도의 이름과 중심 좌표를 번들에 싣는다.
 * 네트워크가 없어도, 어떤 외부 서비스가 죽어도, "지역"은 언제나 찾아진다.
 * 가게·역 같은 POI는 그 위에 온라인(TMAP·Photon)이 얹는다.
 *
 * ## 원료
 *
 * southkorea/southkorea-maps (GitHub) — 통계청 센서스용 행정구역경계 2013,
 * WGS84, mapshaper 1% 단순화판. 이름은 안정적이고 중심점은 수백 m 안에서 맞으면
 * 충분하다(동네로 걸어가는 앱이지 측량 앱이 아니다).
 *
 *   시도    kostat/2013/json/skorea_provinces_geo_simple.json        (2자리 코드)
 *   시군구  kostat/2013/json/skorea_municipalities_geo_simple.json   (5자리)
 *   읍면동  kostat/2013/json/skorea_submunicipalities_geo_simple.json (7자리)
 *
 * 코드가 계층을 그대로 담는다 — 읍면동 코드 앞 5자리가 시군구, 앞 2자리가 시도.
 * 그래서 이름만 싣고 상위 구역은 코드에서 되찾는다(`regions/search.ts`).
 *
 * 2013년 이후 생기거나 이름이 바뀐 동은 여기 없다. 그건 온라인 검색이 받는다.
 * 더 새 데이터로 갈아 끼우려면 위 세 URL만 바꾸면 된다.
 *
 * ## 쓰는 법
 *
 *   node scripts/build-region-index.mjs
 *
 * 세 파일을 받아 중심점을 계산하고 TS 파일을 다시 쓴다. 결과물은 커밋한다 —
 * 빌드 때마다 GitHub을 부르지 않는다.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, 'src', 'data', 'regions', 'korea.ts');

const BASE = 'https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2013/json';
const SOURCES = [
  ['provinces', `${BASE}/skorea_provinces_geo_simple.json`],
  ['municipalities', `${BASE}/skorea_municipalities_geo_simple.json`],
  ['submunicipalities', `${BASE}/skorea_submunicipalities_geo_simple.json`],
];

async function fetchGeoJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${res.status} ${url}`);
  }
  // 파일에 BOM이 붙어 있을 수 있다.
  const text = (await res.text()).replace(/^﻿/, '');
  return JSON.parse(text);
}

/** 외곽 링들. Polygon이면 하나, MultiPolygon이면 폴리곤마다 하나. */
function outerRings(geometry) {
  if (geometry.type === 'Polygon') {
    return [geometry.coordinates[0]];
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.map((polygon) => polygon[0]);
  }
  return [];
}

/**
 * 면적가중 중심점(shoelace). 링이 여럿이면(섬이 딸린 동) 가장 큰 것의 중심 —
 * 본체가 아니라 섬과 본체 사이 바다 한가운데를 가리키지 않도록.
 */
function centroid(geometry) {
  let best = null;
  let bestArea = 0;
  for (const ring of outerRings(geometry)) {
    let area = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < ring.length - 1; i += 1) {
      const [x0, y0] = ring[i];
      const [x1, y1] = ring[i + 1];
      const cross = x0 * y1 - x1 * y0;
      area += cross;
      cx += (x0 + x1) * cross;
      cy += (y0 + y1) * cross;
    }
    if (Math.abs(area) > Math.abs(bestArea)) {
      bestArea = area;
      best = area !== 0 ? [cx / (3 * area), cy / (3 * area)] : ring[0];
    }
  }
  return best; // [lng, lat]
}

function round(n) {
  return Math.round(n * 1e5) / 1e5; // ±1m 남짓. 더 정밀할 이유가 없다.
}

const layers = {};
for (const [key, url] of SOURCES) {
  process.stdout.write(`받는 중: ${key} ... `);
  layers[key] = await fetchGeoJson(url);
  console.log(`${layers[key].features.length}개`);
}

const rows = [];
for (const key of ['provinces', 'municipalities', 'submunicipalities']) {
  for (const feature of layers[key].features) {
    const { code, name } = feature.properties;
    const c = centroid(feature.geometry);
    if (c == null || !name) {
      continue;
    }
    rows.push({ code, name, lat: round(c[1]), lng: round(c[0]) });
  }
}

/*
 * "성남시분당구" → 이름 "분당구", 도시 "성남시".
 *
 * 통계청은 일반시 밑의 구를 시 이름까지 붙여 한 덩어리로 적는다. 사람은 "분당구"나
 * "분당"을 치지 "성남시분당구"를 치지 않는다. 이름을 구로 줄이고 시는 따로
 * 들고 있다가 주소 줄("경기도 성남시")에 쓴다. 그리고 그 시 자체도 찾아져야
 * 하므로("성남"), 구들의 중심 평균으로 시 항목을 하나 만든다 — 코드는
 * `시도코드 + 'C' + 번호` 네 자리라 어느 구의 접두사도 되지 않는다.
 */
const cities = new Map(); // `${sido}|${city}` → {sido, name, lats, lngs}
for (const r of rows) {
  if (r.code.length !== 5) continue;
  const m = /^(.+?시)(.+구)$/.exec(r.name);
  if (m == null) continue;
  r.name = m[2];
  r.city = m[1];
  const key = `${r.code.slice(0, 2)}|${m[1]}`;
  const g = cities.get(key) ?? { sido: r.code.slice(0, 2), name: m[1], lats: [], lngs: [] };
  g.lats.push(r.lat);
  g.lngs.push(r.lng);
  cities.set(key, g);
}
{
  const perSido = new Map();
  for (const g of cities.values()) {
    const n = perSido.get(g.sido) ?? 0;
    perSido.set(g.sido, n + 1);
    const suffix = n.toString(36).toUpperCase();
    if (suffix.length !== 1) throw new Error(`시 코드 자릿수 초과: ${g.sido} ${g.name}`);
    const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    rows.push({ code: `${g.sido}C${suffix}`, name: g.name, lat: round(mean(g.lats)), lng: round(mean(g.lngs)) });
  }
  console.log(`구를 거느린 시 항목: ${cities.size}개`);
}
/*
 * 법정동 이름을 파생한다 — "상도1동·상도2동·상도3동·상도4동" → "상도동".
 *
 * 통계청 경계는 **행정동**이라 "상도동"이 없다. 그런데 사람들은 법정동 이름을
 * 친다("상도동 살아요"지 "상도3동 살아요"가 아니다). 전국 행정동 3,482개 중
 * 1,060개가 번호를 달고 있어서, 이 규칙 하나가 사람들이 실제로 치는 이름의
 * 큰 몫을 받는다. 파생 항목의 중심은 번호 동들의 중심점 평균이고, 코드는
 * `시군구코드 + 'D' + 번호`로 7자리를 맞춘다(상위 구역 되찾기는 앞 5·2자리라
 * 그대로 통한다). 같은 시군구에 그 이름의 진짜 행정동이 이미 있으면 만들지 않는다.
 *
 * 못 받는 것: "여의동"(행정동) ↔ "여의도동"(법정동)처럼 번호가 아닌 이름 차이.
 * 그런 것은 핫스팟이나 온라인 검색이 받는다.
 */
const BASE_OF = [
  [/^(.+?)\d+가\d+동$/, '$1동'], // 성수1가1동 → 성수동
  // 숫자와 중간점을 함께 걷어낸다 — 면목3·8동 → 면목동. 숫자만 보면('\d+동')
  // 뒤의 '8동'만 떨어져 '면목3·동'이라는 없는 동을 만든다. 실제로 13개 만들었다.
  [/^(.+?)[0-9·]+동$/, '$1동'],
];
const groups = new Map(); // `${muni}|${base}` → {code, name, lats[], lngs[]}
const existing = new Set(rows.map((r) => `${r.code.slice(0, 5)}|${r.name}`));
for (const r of rows) {
  if (r.code.length !== 7) continue;
  for (const [re, tpl] of BASE_OF) {
    if (!re.test(r.name)) continue;
    const base = r.name.replace(re, tpl);
    if (base === r.name) break;
    // 접고도 숫자나 중간점이 남았으면 이름을 잘못 접은 것이다. 만들지 않는다.
    if (/[0-9·]/.test(base)) break;
    const key = `${r.code.slice(0, 5)}|${base}`;
    if (existing.has(key)) break;
    const g = groups.get(key) ?? { muni: r.code.slice(0, 5), name: base, lats: [], lngs: [] };
    g.lats.push(r.lat);
    g.lngs.push(r.lng);
    groups.set(key, g);
    break;
  }
}
let derivedCount = 0;
const byMuni = new Map();
for (const g of groups.values()) {
  const n = byMuni.get(g.muni) ?? 0;
  byMuni.set(g.muni, n + 1);
  // 시군구 하나에 파생 동이 36개를 넘을 일은 없다(0-9A-Z). 넘으면 여기서 알게 된다.
  const suffix = n.toString(36).toUpperCase();
  if (suffix.length !== 1) throw new Error(`파생 코드 자릿수 초과: ${g.muni} ${g.name}`);
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  rows.push({ code: `${g.muni}D${suffix}`, name: g.name, lat: round(mean(g.lats)), lng: round(mean(g.lngs)) });
  derivedCount += 1;
}
console.log(`법정동 이름 파생: ${derivedCount}개`);

// 코드 순으로 — 시도 → 시군구 → 읍면동이 자연히 계층 순서가 되고 diff가 안정된다.
rows.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));

const q = (s) => `'${s.replace(/'/g, "\\'")}'`;
const body = rows
  .map((r) =>
    r.city != null
      ? `  [${q(r.code)}, ${q(r.name)}, ${r.lat}, ${r.lng}, ${q(r.city)}],`
      : `  [${q(r.code)}, ${q(r.name)}, ${r.lat}, ${r.lng}],`
  )
  .join('\n');

const file = `/**
 * 전국 행정구역 색인 — 시도 ${layers.provinces.features.length} · 시군구 ${layers.municipalities.features.length} · 읍면동 ${layers.submunicipalities.features.length}.
 *
 * **생성된 파일이다. 손으로 고치지 말 것.** \`node scripts/build-region-index.mjs\`
 * 가 통계청 센서스용 행정구역경계(2013, southkorea/southkorea-maps)에서 만든다.
 * 왜 있는지, 무엇을 못 하는지는 그 스크립트 머리에 있다.
 *
 * 한 줄이 [코드, 이름, 위도, 경도]다. 코드가 계층을 담는다 —
 * 2자리 시도, 5자리 시군구, 7자리 읍면동. 읍면동 코드의 앞 5자리가 그 시군구,
 * 앞 2자리가 그 시도라서 상위 이름은 여기서 찾는다(\`search.ts\`).
 *
 * 코드 여섯째 자리가 'D'인 줄은 **파생한 법정동 이름**이다 — "상도1~4동"에서
 * 만든 "상도동". 사람들은 행정동 번호가 아니라 법정동 이름을 치기 때문이다.
 * 중심은 번호 동들의 평균이다.
 *
 * 다섯째 값이 있는 줄은 일반시 밑의 구다 — 원료의 "성남시분당구"를 "분당구"로
 * 줄이고 "성남시"를 따로 둔 것. 주소 줄에 시가 들어가야 어느 분당구인지 보인다.
 * 코드 셋째 자리가 'C'인 네 자리 줄은 그 시 자체("성남시")다.
 */

export type RegionRow = readonly [code: string, name: string, lat: number, lng: number, city?: string];

export const KOREA_REGIONS: readonly RegionRow[] = [
${body}
];
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, file, 'utf8');
console.log(`썼음: ${OUT} (${rows.length}행, ${(Buffer.byteLength(file) / 1024).toFixed(0)}KB)`);

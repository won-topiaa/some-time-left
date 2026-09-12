#!/usr/bin/env node
/**
 * 전국 철도역 색인을 만든다 — `src/data/stations/korea.ts`.
 *
 * ## 왜 있나
 *
 * "봉천역"을 쳤는데 안 나왔다. 번들 안의 오프라인 바닥에는 역이 **하나도** 없었다
 * — 행정구역 색인(읍면동 3,482)에 역은 없고, 서울 핫스팟 121곳 중 이름에 '역'이
 * 든 46곳은 혼잡도용 지점이 우연히 역 이름인 것이라 서울 지하철 약 300곳의
 * 6분의 1도 안 된다. 서울 밖은 한 곳도 없었다(부산·대구·대전·광주·인천·경기·강원
 * 전부 X). 그래서 역 이름은 전적으로 온라인 층(TMAP·Photon)에 달려 있었고,
 * 그 층이 막히면 역은 통째로 "없는 곳"이 됐다.
 *
 * 바닥은 번들 안에 있어야 한다. 행정구역 색인이 그래서 생겼고, 이건 그 옆자리다.
 *
 * ## 출처
 *
 * OpenStreetMap, Overpass API. `railway=station`과 `railway=halt` 노드를 받는다.
 * 도시철도(지하철·경전철)와 일반철도(KTX·무궁화 등) 역이 같은 태그를 쓰므로
 * 한 번에 받아진다. 데이터는 ODbL이다 — 앱의 출처 표기에 OSM이 이미 들어 있다.
 *
 * **좌표는 절대 지어내지 않는다.** 이 저장소가 한 번 그렇게 해서 산자락을
 * 가로지르는 삼각형이 실기기에 떴다. 여기서 나가는 좌표는 전부 OSM이 준 것이다.
 *
 * ## 쓰는 법
 *
 *   node scripts/build-station-index.mjs
 *
 * Overpass는 남의 무료 서버다. 구역을 넷으로 갈라 하나씩, 사이를 두고 묻는다.
 * 서버가 붐비면 504를 주는 일이 흔해서 청크마다 몇 번 다시 묻는다 — 그래도
 * 실패하면 **색인을 쓰지 않고 멈춘다.** 조용히 반쪽짜리 색인을 커밋하는 것이
 * 이 저장소에서 가장 하면 안 되는 일이다(그러면 그 지역 역이 소리 없이 사라진다).
 *
 * 이미 받아 둔 응답이 있으면 그걸로 만들 수도 있다. Overpass가 며칠 붐빌 때
 * 쓰라고 둔 문이다 — 형식은 Overpass가 준 `elements` 배열 그대로다.
 *
 *   node scripts/build-station-index.mjs --from raw.json
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, 'src', 'data', 'stations', 'korea.ts');
const ENDPOINT = 'https://overpass-api.de/api/interpreter';

/**
 * 남한을 덮는 구역들. 한 번에 다 물으면 서버가 시간 초과를 낸다.
 *
 * 위쪽 경계를 38.65로 둔 건 북한을 최소한으로 물기 위해서다(그래도 걸리는 것은
 * 아래 `insideKorea`가 자른다). 동쪽 129.7은 대마도(일본)를 피한다.
 */
const CHUNKS = [
  ['수도권·강원', 37.0, 125.0, 38.65, 129.7],
  ['충청·경북북부', 36.0, 125.0, 37.0, 129.7],
  ['전북·경북·대구', 35.0, 125.0, 36.0, 129.7],
  ['전남·경남·부산·제주', 32.9, 125.0, 35.0, 129.7],
];

const TRIES = 5;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function query(south, west, north, east) {
  return `[out:json][timeout:90];
(
  node["railway"="station"](${south},${west},${north},${east});
  node["railway"="halt"](${south},${west},${north},${east});
);
out tags center;`;
}

async function fetchChunk(label, south, west, north, east) {
  for (let attempt = 1; attempt <= TRIES; attempt += 1) {
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          // 누가 부르는지 밝힌다. 무료 서버의 최소 예의이고, 밝히지 않으면 막는다.
          'User-Agent': 'some-time-left/1.0 (offline station index build; one-off)',
        },
        body: new URLSearchParams({ data: query(south, west, north, east) }),
      });
      const text = await response.text();
      if (response.ok && text.startsWith('{')) {
        return JSON.parse(text).elements ?? [];
      }
      console.log(`  ${label} ${attempt}/${TRIES}: http=${response.status} (서버가 붐빕니다)`);
    } catch (error) {
      console.log(`  ${label} ${attempt}/${TRIES}: ${error.message}`);
    }
    await sleep(attempt * 8000);
  }
  return null;
}

/** 남한 안인가. 좌표로 일본 섬과 북한 내륙을 자른다. */
function insideKorea(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < 33.0 || lat > 38.62 || lng < 125.0 || lng > 129.65) return false;
  // 38선 위쪽은 강원 고성 일부를 빼면 전부 북한이다.
  if (lat > 38.35 && lng < 128.0) return false;
  return true;
}

/**
 * 북한 역인가.
 *
 * 좌표만으로는 다 못 자른다 — 경계 근처의 동해안 역들이 남는다. 다행히 OSM이
 * 운영 주체를 적어 둔다(실측: 54곳이 '조선민주주의인민공화국 철도성'). 걸어서
 * 갈 수 있는 목적지가 아니므로 검색 결과에 있을 이유가 없다.
 */
function inNorthKorea(tags) {
  const who = `${tags.operator ?? ''} ${tags['operator:ko'] ?? ''} ${tags.network ?? ''} ${tags['network:ko'] ?? ''}`;
  return who.includes('조선민주주의인민공화국') || who.includes('철도성');
}

/**
 * 결과 줄 아래에 붙일 한 줄.
 *
 * **재지 않고 아는 것만 쓴다.** 행정구역 색인에서 가장 가까운 읍면동을 찾아
 * "서울특별시 관악구"를 붙이는 쪽이 읽기엔 낫지만, 그건 중심점끼리의 거리로
 * 추측한 값이라 경계 근처에서 옆 구를 적게 된다. 지하철역 하나를 두고 앱이
 * 틀린 구를 단정하는 것보다, OSM이 실제로 적어 둔 운영 주체를 쓰는 편이 정직하다.
 * (실측 분포: 수도권 전철 402, 한국철도공사 274, 부산교통공사 109 …)
 */
function operatorLine(tags) {
  return (
    tags['network:ko'] ??
    tags.network ??
    tags['operator:ko'] ??
    tags.operator ??
    ''
  ).trim();
}

/** 한글이 든 이름만 쓴다. 로마자·가나만 있는 이름은 우리 검색에 잡히지 않는다. */
const HANGUL = /[가-힣]/;

/**
 * 같은 역을 하나로 본다.
 *
 * 환승역은 노선마다 노드가 따로 있고(신도림역은 1·2호선), 출입구가 별도
 * 노드인 곳도 있다. 같은 이름이 이만큼 안에 있으면 한 역으로 보고 첫 것만 남긴다.
 * 이름이 같아도 먼 곳(신촌역 2호선과 경의중앙선은 약 500m)은 둘 다 남기지 않고
 * 하나로 합친다 — 목적지로는 같은 동네이고, 둘을 보여 주면 고르기만 어려워진다.
 */
const SAME_STATION_M = 1200;

function distanceM(a, b) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * 이름을 표기 그대로 쓰되, '역'으로 끝나지 않으면 붙여 준다.
 *
 * OSM은 역 이름에 '역'을 **안 붙인다** — 실측으로 1,323곳 중 7곳만 '역'으로
 * 끝났다(서울역·부산역·대구역처럼 이름 자체에 든 경우다). 그러니 데이터에는
 * "봉천"이 있고 사람은 "봉천역"을 친다. 여기서 맞춰 두지 않으면 색인을 넣어도
 * 못 찾는다 — 이 파일이 생긴 계기가 정확히 그 입력이었다.
 *
 * 붙이는 것이 지어내기는 아니다. `railway=station` 노드는 전부 역이고, '역'은
 * 한국어에서 그 이름을 부르는 방식이다("한성대입구" → "한성대입구역").
 */
function displayName(raw) {
  const name = raw.trim().replace(/\s+/g, ' ');
  return name.endsWith('역') ? name : `${name}역`;
}

async function collect() {
  // 이미 받아 둔 응답으로 만들 수 있다 — Overpass가 며칠 붐빌 때의 문.
  const fromIndex = process.argv.indexOf('--from');
  if (fromIndex !== -1 && process.argv[fromIndex + 1] != null) {
    const path = process.argv[fromIndex + 1];
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    const elements = Array.isArray(parsed) ? parsed : (parsed.elements ?? []);
    console.log(`${path}에서 ${elements.length}개를 읽었습니다.`);
    return elements;
  }

  console.log('OpenStreetMap에서 전국 철도역을 받습니다 (Overpass).\n');

  const elements = [];
  const missing = [];
  for (const [label, south, west, north, east] of CHUNKS) {
    const got = await fetchChunk(label, south, west, north, east);
    if (got == null) {
      console.log(`${label}: 못 받았습니다`);
      missing.push(label);
      continue;
    }
    console.log(`${label}: ${got.length}개`);
    elements.push(...got);
    await sleep(4000);
  }

  if (missing.length > 0) {
    console.error('');
    console.error(`받지 못한 구역이 있습니다: ${missing.join(', ')}`);
    console.error('반쪽짜리 색인을 쓰면 그 지역 역이 조용히 사라집니다.');
    console.error('잠시 뒤에 다시 실행해 주세요 — Overpass가 붐빌 때 자주 그럽니다.');
    process.exit(1);
  }

  return elements;
}

async function main() {
  const elements = await collect();

  /** 이름 → 남길 좌표들. 같은 이름이 가까이 여러 개면 하나로 본다. */
  const kept = [];
  const byName = new Map();
  let dropped = 0;

  for (const element of elements) {
    const tags = element.tags ?? {};
    const raw = tags.name ?? tags['name:ko'];
    const lat = element.lat ?? element.center?.lat;
    const lng = element.lon ?? element.center?.lon;

    if (typeof raw !== 'string' || raw.trim() === '' || !HANGUL.test(raw)) {
      dropped += 1;
      continue;
    }
    if (!insideKorea(lat, lng) || inNorthKorea(tags)) {
      dropped += 1;
      continue;
    }

    const name = displayName(raw);
    const here = { lat, lng };
    const seen = byName.get(name);
    if (seen != null && seen.some((at) => distanceM(at, here) <= SAME_STATION_M)) {
      dropped += 1;
      continue;
    }
    byName.set(name, [...(seen ?? []), here]);
    kept.push({ name, lat, lng, who: operatorLine(tags) });
  }

  // 이름 순으로 고정한다. 생성할 때마다 줄 순서가 바뀌면 diff가 쓸모없어진다.
  kept.sort((a, b) => (a.name === b.name ? a.lat - b.lat : a.name.localeCompare(b.name, 'ko')));

  const rows = kept
    .map((s) => {
      const who = s.who === '' ? '' : `, '${s.who.replace(/'/g, "\\'")}'`;
      return `  ['${s.name}', ${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}${who}],`;
    })
    .join('\n');

  const file = `/**
 * 전국 철도역 색인 — ${kept.length}곳.
 *
 * **생성된 파일이다. 손으로 고치지 말 것.** \`node scripts/build-station-index.mjs\`
 * 가 OpenStreetMap(Overpass API)에서 만든다. 왜 있는지, 무엇을 못 하는지는
 * 그 스크립트 머리에 있다.
 *
 * 한 줄이 [이름, 위도, 경도, 운영주체?]다. 도시철도와 일반철도가 섞여 있다 —
 * OSM에서 둘 다 \`railway=station\`이고, 약속 장소로는 둘 다 쓰인다.
 *
 * 이름은 OSM 표기를 그대로 쓰되 '역'으로 끝나지 않는 것에만 붙였다(OSM은
 * '역'을 안 붙인다 — 1,323곳 중 7곳만 붙어 있었다). 환승역처럼 같은 이름이
 * 여러 노드인 경우는 하나로 합쳤고, 북한 역은 뺐다.
 *
 * 데이터 © OpenStreetMap 기여자들, ODbL.
 */

export type StationRow = readonly [name: string, lat: number, lng: number, who?: string];

export const KOREA_STATIONS: readonly StationRow[] = [
${rows}
];
`;

  writeFileSync(OUT, file, 'utf8');
  console.log('');
  console.log(`${kept.length}곳을 남겼습니다 (버린 것 ${dropped}개: 이름 없음·한국 밖·같은 역 중복).`);
  console.log(`→ ${OUT}`);
}

await main();

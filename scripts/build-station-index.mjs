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
        const parsed = JSON.parse(text);
        /*
         * **200이 성공이 아니다.** Overpass는 시간 초과나 과부하를 HTTP 200에
         * `remark`만 담아 보내기도 한다. `elements ?? []`로 받으면 빈 배열이
         * 성공으로 통과하고, 그 구역이 통째로 빠진 색인을 조용히 써 버린다 —
         * 머리 주석이 "실패하면 멈춘다"고 약속한 바로 그 실패다.
         */
        if (parsed.remark == null && Array.isArray(parsed.elements) && parsed.elements.length > 0) {
          return parsed.elements;
        }
        console.log(
          `  ${label} ${attempt}/${TRIES}: 200인데 비었습니다${parsed.remark != null ? ` (${String(parsed.remark).slice(0, 80)})` : ''}`
        );
      } else {
        console.log(`  ${label} ${attempt}/${TRIES}: http=${response.status} (서버가 붐빕니다)`);
      }
    } catch (error) {
      console.log(`  ${label} ${attempt}/${TRIES}: ${error.message}`);
    }
    await sleep(attempt * 8000);
  }
  return null;
}

/**
 * 남한의 북쪽 경계 — 경도 구간마다 다른 위도 상한.
 *
 * **한 상자로는 못 자른다.** 휴전선이 서쪽에서 아래로 처져 있어서, 황해남·북도와
 * 개성의 역들이 강원 고성보다 한참 남쪽에 있다. 처음엔 `lat > 38.35 && lng < 128`
 * 한 줄로 잘랐는데 그 밑을 북한 역 35곳이 그대로 통과했다 — 개성역(37.969),
 * 판문역(37.928), 강령역(37.901), 부포역(37.826)… 그래서 "북한 역은 뺐다"고
 * 적어 놓고 개성역을 목적지로 내놓고 있었다.
 *
 * 실측으로 맞춘 계단이다. 서쪽(lng < 126.70)에서 남한 역의 최북단은 약 37.66
 * (운양역 37.654, 구래역 37.645)이고, 경의선이 올라가는 가운데 구간(126.70 이상)
 * 에서만 도라산역 37.898·임진강역 37.888까지 올라간다. 동쪽은 제진역 38.568까지다.
 *
 * 이 표로 재면 남한 역 오탈락 0건, 북한 역 잔존 0건이다(아래 테스트가 확인한다).
 */
const NORTH_EDGE = [
  // [이 경도 미만이면, 위도는 이 값 이하]
  [126.7, 37.8],
  [128.0, 38.35],
  [129.65, 38.62],
];

/** 남한 안인가. 좌표만으로 판정한다 — 태그는 못 믿는다(아래 inNorthKorea 참고). */
function insideKorea(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < 33.0 || lng < 125.0 || lng > 129.65) return false;
  for (const [lngLimit, latLimit] of NORTH_EDGE) {
    if (lng < lngLimit) {
      return lat <= latLimit;
    }
  }
  return false;
}

/**
 * 북한 역인가 — 태그로 한 번 더 본다.
 *
 * **이것만으로는 안 된다.** 태그된 것이 54곳인데 이 검사가 실제로 잘라낸 건
 * 14곳뿐이었고(40곳은 위 좌표 판정이 이미 잘랐다), 통과한 북한 역 35곳은
 * operator·network 태그가 **아예 없었다**(개성역 노드에는 name과 wikidata만 있다).
 * 그래서 남한만 남기는 일은 좌표가 하고, 이건 태그가 분명한 것을 덤으로 거른다.
 */
function inNorthKorea(tags) {
  const who = `${tags.operator ?? ''} ${tags['operator:ko'] ?? ''} ${tags.network ?? ''} ${tags['network:ko'] ?? ''}`;
  return who.includes('조선민주주의인민공화국') || who.includes('철도성');
}

/**
 * 지금 영업하는 역인가.
 *
 * 폐역·철거역은 목적지가 될 수 없다. OSM은 그걸 키 접두로 적는다
 * (`disused:railway=station`, `abandoned:railway=station`).
 *
 * **공사 중(`construction`)은 여기서 안 버린다.** 하양역은 2024년 12월에 개통한
 * 영업역인데 OSM에 공사 중 노드가 남아 있다 — 한 묶음으로 버리면 진짜 역을 지운다.
 * 대신 같은 이름이 겹칠 때 영업 노드를 먼저 남기도록 아래에서 순서를 준다.
 */
function stillOpen(tags) {
  return !Object.keys(tags).some(
    (key) => key.startsWith('disused:') || key.startsWith('abandoned:')
  );
}

/**
 * 중복 제거에서 누가 살아남을지 정하는 순위. 작을수록 먼저 남는다.
 *
 * 예전엔 Overpass가 준 순서였다. 그래서 하양역은 공사 중 노드가 남고 90m 옆의
 * 운영 중 노드(대구교통공사)가 버려졌고, 신촌·화명·사상은 지하철 노드가, 벡스코·
 * 범일·부전은 철도 노드가 지워졌다 — 일관성이 없고 다음 재생성에서 조용히 뒤집힌다.
 */
function survivorRank(tags) {
  if (tags.construction != null || tags['construction:railway'] != null) return 2;
  // 운영 주체가 적힌 노드가 대개 더 잘 관리된 쪽이다.
  return operatorLine(tags) === '' ? 1 : 0;
}

/**
 * 결과 줄 아래에 붙일 한 줄.
 *
 * **재지 않고 아는 것만 쓴다.** 행정구역 색인에서 가장 가까운 읍면동을 찾아
 * "서울특별시 관악구"를 붙이는 쪽이 읽기엔 낫지만, 그건 중심점끼리의 거리로
 * 추측한 값이라 경계 근처에서 옆 구를 적게 된다. 지하철역 하나를 두고 앱이
 * 틀린 구를 단정하는 것보다, OSM이 실제로 적어 둔 운영 주체를 쓰는 편이 정직하다.
 *
 * 분포는 여기 적지 않는다 — 적어 두면 다음 재생성에서 조용히 거짓이 된다.
 * 돌릴 때마다 실제 분포를 화면에 찍으므로 그때 보면 된다.
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

/** 운영 주체를 다른 잣대로 한 번 더 — 위 값이 겹칠 때 구분에 쓴다. */
function operatorFallback(tags) {
  return (tags['operator:ko'] ?? tags.operator ?? tags.network ?? '').trim();
}

/** 한글이 든 이름만 쓴다. 로마자·가나만 있는 이름은 우리 검색에 잡히지 않는다. */
const HANGUL = /[가-힣]/;

/**
 * 같은 역을 하나로 본다.
 *
 * 환승역은 노선마다 노드가 따로 있고(서울역은 다섯), 출입구가 별도 노드인 곳도
 * 있다. 같은 이름이 이만큼 안에 있으면 한 역으로 보고 하나만 남긴다.
 *
 * **1200m였다가 600m로 내렸다.** 1200m는 2호선 신촌역을 지웠다 — 색인에 남은
 * 신촌역은 경의중앙선 하나였고, 2호선 출구에 서서 "신촌역"을 치면 704m 떨어진
 * 다른 역이 유일한 결과였다. 이 앱의 보행 속도로 9분이 넘는다. 3분 여유를
 * 만들려는 앱이 그 세 배를 틀리는 셈이다.
 *
 * 600m는 실측으로 고른 값이다. 진짜 한 역의 노드 산포는 이보다 작다 —
 * 수서역 422m(4노드), 사상역 393m(3), 서울역 370m(5). 300m까지 내리면 노원·
 * 청량리·홍대입구처럼 이름도 운영 주체도 같은 한 역이 두 줄로 갈라진다.
 */
const SAME_STATION_M = 600;

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
 * OSM은 역 이름에 '역'을 **안 붙인다** — 받아 온 것 중 극소수만 '역'으로 끝난다
 * (서울역·부산역·대구역처럼 이름 자체에 든 경우다. 정확한 수는 돌릴 때 찍는다).
 * 그러니 데이터에는 "봉천"이 있고 사람은 "봉천역"을 친다. 여기서 맞춰 두지 않으면
 * 색인을 넣어도 못 찾는다 — 이 파일이 생긴 계기가 정확히 그 입력이었다.
 *
 * 붙이는 것이 지어내기는 아니다. `railway=station` 노드는 전부 역이고, '역'은
 * 한국어에서 그 이름을 부르는 방식이다("한성대입구" → "한성대입구역").
 */
function displayName(raw) {
  const name = raw.trim().replace(/\s+/g, ' ');
  /*
   * 마지막 글자만 보면 안 된다. "간치역 (폐역)"은 '역'을 품고도 ')'로 끝나서
   * "간치역 (폐역)역"이 됐다 — 아무도 그렇게 부르지 않는 이름이 화면에 떴다.
   * 괄호와 공백을 떼고 본체가 '역'으로 끝나는지 본다.
   *
   * `includes('역')`으로 하면 안 된다 — 역삼·역곡·역촌·동대문역사문화공원·
   * 암사역사공원이 접미사를 잃고 "역삼역"으로 못 찾게 된다. 전부 실재하는 역이다.
   */
  const body = name.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return body.endsWith('역') || name.endsWith('역') ? name : `${name}역`;
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

  /*
   * 중복 제거 전에 순서를 정해 둔다. Overpass가 준 순서로 돌면 같은 이름 중
   * 누가 남는지가 서버 기분에 달리고, 다음 재생성에서 조용히 뒤집힌다.
   * 영업 노드 먼저, 그다음은 좌표 순 — 같은 입력이면 같은 파일이 나온다.
   */
  const ordered = [...elements].sort((a, b) => {
    const rank = survivorRank(a.tags ?? {}) - survivorRank(b.tags ?? {});
    if (rank !== 0) return rank;
    const aLat = a.lat ?? a.center?.lat ?? 0;
    const bLat = b.lat ?? b.center?.lat ?? 0;
    if (aLat !== bLat) return aLat - bLat;
    return (a.lon ?? a.center?.lon ?? 0) - (b.lon ?? b.center?.lon ?? 0);
  });

  for (const element of ordered) {
    const tags = element.tags ?? {};
    const raw = tags.name ?? tags['name:ko'];
    const lat = element.lat ?? element.center?.lat;
    const lng = element.lon ?? element.center?.lon;

    if (typeof raw !== 'string' || raw.trim() === '' || !HANGUL.test(raw)) {
      dropped += 1;
      continue;
    }
    if (!insideKorea(lat, lng) || inNorthKorea(tags) || !stillOpen(tags)) {
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
    kept.push({
      name,
      lat,
      lng,
      who: operatorLine(tags),
      alt: operatorFallback(tags),
    });
  }

  /*
   * 같은 이름이 둘 남았는데 운영 주체까지 같으면 화면에 똑같은 두 줄이 뜬다.
   * 신촌역이 그렇다 — 2호선과 경의중앙선 노드가 둘 다 `network:ko=수도권 전철`이다.
   * 그때만 다른 잣대(operator: 서울교통공사 / 한국철도공사)로 내려간다.
   */
  const sameLabel = new Map();
  for (const station of kept) {
    const key = `${station.name}|${station.who}`;
    sameLabel.set(key, (sameLabel.get(key) ?? 0) + 1);
  }
  for (const station of kept) {
    if (sameLabel.get(`${station.name}|${station.who}`) > 1 && station.alt !== '') {
      station.who = station.alt;
    }
  }

  // 이름 순으로 고정한다. 생성할 때마다 줄 순서가 바뀌면 diff가 쓸모없어진다.
  kept.sort((a, b) => (a.name === b.name ? a.lat - b.lat : a.name.localeCompare(b.name, 'ko')));

  const rows = kept
    .map((s) => {
      const who = s.who === '' ? '' : `, '${s.who.replace(/'/g, "\\'")}'`;
      return `  ['${s.name}', ${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}${who}],`;
    })
    .join('\n');

  const named = elements.filter(
    (e) => typeof (e.tags?.name ?? e.tags?.['name:ko']) === 'string'
  );
  const alreadySuffixed = named.filter((e) =>
    (e.tags.name ?? e.tags['name:ko']).trim().endsWith('역')
  ).length;

  const distribution = new Map();
  for (const station of kept) {
    const who = station.who === '' ? '(없음)' : station.who;
    distribution.set(who, (distribution.get(who) ?? 0) + 1);
  }
  const top = [...distribution.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

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
 * 이름은 OSM 표기를 그대로 쓰되 '역'으로 끝나지 않는 것에만 붙였다 — OSM은
 * '역'을 안 붙인다(받아 온 이름 ${named.length}개 중 ${alreadySuffixed}개만 붙어 있었다).
 * 환승역처럼 같은 이름이 가까이 여러 노드인 경우는 하나로 합쳤다.
 *
 * 북한 역과 폐역은 뺐다. 북한은 **좌표로** 자른다 — 휴전선이 서쪽에서 처져
 * 있어서 개성·황해도 역들이 강원보다 남쪽에 있고, 태그(운영 주체)에 기대면
 * 태그가 없는 노드가 그대로 통과한다. 한때 그렇게 35곳이 들어와 있었다.
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
  console.log(
    `${kept.length}곳을 남겼습니다 (버린 것 ${dropped}개: 이름 없음·한국 밖·북한·폐역·같은 역 중복).`
  );
  console.log(`이름에 '역'이 이미 붙어 있던 것: ${named.length}개 중 ${alreadySuffixed}개.`);
  console.log('');
  console.log('운영 주체 분포 (많은 순):');
  for (const [who, count] of top) {
    console.log(`  ${String(count).padStart(4)} ${who}`);
  }
  console.log('');
  console.log(`→ ${OUT}`);
}

await main();

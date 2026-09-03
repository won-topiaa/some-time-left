/**
 * 오프라인 지역 검색 — 네트워크 없이 "흑석동"이 찾아진다.
 *
 * 사용자가 "흑석동"을 쳤는데 "찾는 곳이 없어요"가 떴다. 키 없는 번들의 검색은
 * Photon(OSM) → 서울 핫스팟 122곳이었는데, Photon은 실측된 적이 없었고 핫스팟엔
 * 동 이름이 없다. 어느 외부 서비스가 죽든, 오프라인이든, **지역은 언제나
 * 찾아져야 한다** — 그게 이 모듈이 지키는 것이다. 가게·역 같은 POI는 이 위에
 * 온라인 검색이 얹는다.
 *
 * 색인은 `korea.ts`(생성 파일)에 있고 계층은 코드에 들어 있다:
 * 2자리 시도, 5자리 시군구, 7자리 읍면동. 읍면동 코드의 앞 5자리가 시군구,
 * 앞 2자리가 시도다.
 */

import { KOREA_REGIONS, type RegionRow } from './korea';
import { distanceM } from '../../domain/geo';
import type { Place } from '../tmap/parse';
import type { LatLng } from '../../domain/types';

/** 한 번에 돌려줄 최대 개수. 검색 결과 상자가 화면을 덮지 않게. */
const LIMIT = 8;

/** 코드 → 줄. 상위 구역 이름(과 그 구가 딸린 시)을 붙일 때 쓴다. */
const ROW_BY_CODE: ReadonlyMap<string, RegionRow> = new Map(
  KOREA_REGIONS.map((row) => [row[0], row] as const)
);

/**
 * "서울특별시 동작구"처럼 상위 구역을 큰 데서 작은 데로.
 *
 * 같은 이름의 동이 전국에 238쌍 있다(중앙동·연동·삼양동…). 시군구도 중구·남구·
 * 동구가 여러 시에 있다. 이 줄이 없으면 어느 중앙동인지 알 길이 없다.
 *
 * 일반시 밑의 구는 시까지 적는다 — "경기도 성남시 분당구", 그 구의 동이면
 * 시와 구를 다 적는다. 구 줄의 다섯째 값이 그 시다.
 */
function parentLine(row: RegionRow): string {
  const code = row[0];
  const parts: string[] = [];
  // 시도. 2자리 코드 자신에겐 상위가 없다.
  if (code.length > 2) {
    const province = ROW_BY_CODE.get(code.slice(0, 2));
    if (province != null) parts.push(province[1]);
  }
  // 이 줄이 시군구면 제 시를, 읍면동이면 시군구(와 그 시)를.
  if (code.length === 5) {
    if (row[4] != null) parts.push(row[4]);
  } else if (code.length === 7) {
    const municipality = ROW_BY_CODE.get(code.slice(0, 5));
    if (municipality != null) {
      if (municipality[4] != null) parts.push(municipality[4]);
      parts.push(municipality[1]);
    }
  }
  return parts.join(' ');
}

/** 비교용으로 다듬는다 — 공백·대소문자 차이로 못 찾는 일이 없게. */
export function fold(text: string): string {
  return text.replace(/\s+/g, '').toLowerCase();
}

/**
 * 얼마나 잘 맞는가. 작을수록 좋다. `needle`은 `fold`를 거친 값이어야 한다.
 *
 *  0  정확히 그 이름          "흑석동" → 흑석동
 *  1  그 이름으로 시작        "흑석"   → 흑석동
 *  2  이름 어딘가에 들어 있음  "석동"   → 흑석동
 *
 * 내보내는 이유: 여러 출처(지역·핫스팟·TMAP·OSM)의 결과를 한 줄로 세울 때
 * 같은 잣대를 써야 한다. 출처마다 순서 규칙이 다르면 "정확히 맞는 것이 왜 아래에
 * 있지"가 된다.
 */
export function matchRank(needle: string, name: string): number | null {
  const folded = fold(name);
  if (folded === needle) return 0;
  /*
   * 한 글자에는 "시작" 우대를 주지 않는다.
   *
   * '역'을 치면 역삼동·역촌동·역북동처럼 '역'으로 시작하는 동이 전국에 여덟을
   * 넘어서, 강남역 바로 옆에 서 있어도 강남역이 밀려난다. 한 글자는 무엇의
   * 시작이라기엔 너무 짧다 — 그때는 다 같은 급으로 두고 가까운 것을 앞세운다.
   */
  if (needle.length >= 2 && folded.startsWith(needle)) return 1;
  if (folded.includes(needle)) return 2;
  return null;
}

interface Hit {
  row: RegionRow;
  rank: number;
}

/**
 * 지역 이름으로 찾는다. 순수 함수, 네트워크 없음.
 *
 * 순서: 잘 맞는 것 → (현재 위치를 알면) 가까운 것 → 이름이 짧은 것.
 * "동작"을 치면 동작구가 동작대로변 어느 동보다 앞에 오고, 부산에 서서 "중구"를
 * 치면 부산 중구가 서울 중구보다 앞에 온다.
 */
export function searchRegions(query: string, near?: LatLng): Place[] {
  const needle = fold(query);
  if (needle.length === 0) {
    return [];
  }

  const hits: Hit[] = [];
  for (const row of KOREA_REGIONS) {
    const rank = matchRank(needle, row[1]);
    if (rank != null) {
      hits.push({ row, rank });
    }
  }

  hits.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (near != null) {
      const da = distanceM(near, { lat: a.row[2], lng: a.row[3] });
      const db = distanceM(near, { lat: b.row[2], lng: b.row[3] });
      if (da !== db) return da - db;
    }
    return a.row[1].length - b.row[1].length;
  });

  return hits.slice(0, LIMIT).map(({ row }) => ({
    name: row[1],
    address: parentLine(row),
    at: { lat: row[2], lng: row[3] },
  }));
}

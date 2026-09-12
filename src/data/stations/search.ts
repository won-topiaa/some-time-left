/**
 * 오프라인 역 검색 — 네트워크 없이 "봉천역"이 찾아진다.
 *
 * 사용자가 "봉천역"을 쳤는데 안 나왔다. 번들 안의 오프라인 바닥에 역이 **하나도**
 * 없었기 때문이다 — 행정구역 색인(읍면동 3,482)에는 역이 없고, 서울 핫스팟 121곳
 * 중 이름에 '역'이 든 46곳은 혼잡도 지점이 우연히 역 이름인 것이라 서울 지하철
 * 약 300곳의 6분의 1도 안 됐다. 서울 밖은 한 곳도 없었다(부산·대구·대전·광주·
 * 인천·경기·강원 전부). 그래서 역 이름은 전적으로 온라인 층에 달려 있었고,
 * 그 층이 막히면 역은 통째로 "없는 곳"이 됐다.
 *
 * 이 모듈이 지키는 것: **어느 외부 서비스가 죽든 역은 찾아진다.**
 * 행정구역 색인이 지역에 대해 하는 일과 같고, 그 옆자리다.
 *
 * 색인은 `korea.ts`(생성 파일)에 있다 — 출처는 OpenStreetMap이다.
 */

import { KOREA_STATIONS, type StationRow } from './korea';
import { fold, matchRank } from '../regions/search';
import { distanceM } from '../../domain/geo';
import type { Place } from '../tmap/parse';
import type { LatLng } from '../../domain/types';

/** 한 번에 돌려줄 최대 개수. 검색 결과 상자가 화면을 덮지 않게. */
const LIMIT = 8;

/**
 * 다듬어 둔 이름들. 색인과 같은 순서.
 *
 * 검색마다 1,267개를 다시 다듬으면(정규식 + toLowerCase) Hermes에는 JIT이 없어
 * 타이핑 한 번에 그만큼이 쌓인다. 첫 검색 때 한 번만 다듬고 계속 쓴다 —
 * 행정구역 색인이 같은 이유로 같은 일을 한다.
 */
let foldedNames: string[] | null = null;

function foldedNameAt(index: number): string {
  if (foldedNames == null) {
    foldedNames = KOREA_STATIONS.map((row) => fold(row[0]));
  }
  return foldedNames[index];
}

/**
 * '역'을 뗀 이름. "봉천역" → "봉천".
 *
 * 색인의 이름은 전부 '역'으로 끝난다(생성할 때 맞춰 뒀다). 그런데 사람은
 * "봉천역"도 "봉천"도 친다. 앞엣것은 그대로 맞고 뒤엣것은 앞글자 일치로 걸린다 —
 * 거기까지는 이 함수가 없어도 된다.
 *
 * 이 함수가 필요한 쪽은 **가운데에 든 역 이름**이다. "총신대입구(이수)역"에서
 * "이수역"을 찾으려면 색인 쪽의 '역'을 떼고 봐야 "이수"가 걸린다. 괄호 표기나
 * 병기 이름이 있는 역이 그렇다.
 */
function withoutStationSuffix(folded: string): string {
  return folded.length > 1 && folded.endsWith('역') ? folded.slice(0, -1) : folded;
}

interface Hit {
  row: StationRow;
  rank: number;
  /** 현재 위치에서의 거리 (m). 위치를 모르면 0 — 그때는 순서에 안 쓰인다. */
  distance: number;
}

/**
 * 얼마나 잘 맞는가. 작을수록 좋다. 못 맞으면 null.
 *
 * '역'을 뗀 쪽으로도 한 번 본다. 둘 중 더 잘 맞는 값을 쓴다 — "이수역"이
 * "총신대입구(이수)역"에 걸리는 건 이 두 번째 시도 덕이다.
 */
function rankStation(needle: string, folded: string): number | null {
  const direct = matchRank(needle, folded);
  const bare = matchRank(withoutStationSuffix(needle), withoutStationSuffix(folded));
  if (direct == null) return bare;
  if (bare == null) return direct;
  return Math.min(direct, bare);
}

/**
 * 역 이름으로 찾는다. 순수 함수, 네트워크 없음.
 *
 * 순서: 잘 맞는 것 → (현재 위치를 알면) 가까운 것 → 이름이 짧은 것.
 * 같은 이름의 역이 전국에 여럿 있다(중동·부평·주안…). 거리가 그걸 가른다.
 */
export function searchStations(query: string, near?: LatLng): Place[] {
  const needle = fold(query);
  if (needle.length === 0) {
    return [];
  }

  const hits: Hit[] = [];
  for (let i = 0; i < KOREA_STATIONS.length; i += 1) {
    const rank = rankStation(needle, foldedNameAt(i));
    if (rank != null) {
      const row = KOREA_STATIONS[i];
      // 거리는 여기서 한 번만. 비교자 안에서 재면 정렬이 하버사인을 n log n 번 돈다.
      const distance = near == null ? 0 : distanceM(near, { lat: row[1], lng: row[2] });
      hits.push({ row, rank, distance });
    }
  }

  hits.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (a.distance !== b.distance) return a.distance - b.distance;
    return a.row[0].length - b.row[0].length;
  });

  return hits.slice(0, LIMIT).map(({ row }) => ({
    name: row[0],
    address: row[3] ?? '',
    at: { lat: row[1], lng: row[2] },
  }));
}

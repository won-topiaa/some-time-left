/**
 * 목적지 혼잡도 — 도착 화면에서 한 줄 얹는 용도.
 *
 *   "5분 남았어요. 성수카페거리 일대, 지금 붐벼요."
 *
 * TMAP Puzzle(대형 쇼핑시설 200곳)을 쓰다가 **서울 실시간 인구데이터**로 옮겼다.
 * 이유는 두 가지다.
 *
 * 1. Puzzle은 앱 키의 월 사용량을 먹는다 — 실제로 한 달의 80%를 썼다.
 *    서울 데이터는 우리 프록시가 5분 캐시로 받고 있어서 앱 키를 아예 안 쓴다.
 *    경로의 한적함(quiet)이 이미 쓰는 바로 그 파이프라인이다.
 * 2. 걷는 약속 장소와는 서울 주요 장소 쪽이 더 겹친다. 쇼핑몰 목록에는
 *    "성수카페거리"도 "연남동"도 없다.
 *
 * 목록 밖이면 null이고, 화면은 그 줄을 아예 안 그린다 — 억지로 먼 동네 값을
 * 씌우지 않는다. 부가 정보의 실패가 흐름을 막아서도 안 된다.
 */

import { fetchCongestionAt, type AreaCongestion } from './seoul/congestion';
import type { LatLng } from '../domain/types';

export type DestinationCongestion = AreaCongestion;

/**
 * 목적지의 지금 혼잡도. 대상 장소가 아니거나 조회에 실패하면 null.
 *
 * 좌표만 받는다. Puzzle 시절에는 poiId와 이름으로 맞췄지만 서울 데이터는
 * 좌표에서 가장 가까운 장소를 찾으므로, 그 시절의 인자를 계속 받으면
 * 쓰지도 않는 값을 세 파일이 나르게 된다.
 */
export async function lookupDestinationCongestion(
  at: LatLng | null
): Promise<DestinationCongestion | null> {
  if (at == null) {
    return null;
  }

  try {
    return await fetchCongestionAt(at);
  } catch {
    return null;
  }
}

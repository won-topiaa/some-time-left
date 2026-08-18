/**
 * 서울 실시간 인구데이터가 다루는 장소들.
 *
 * API는 장소명(AREA_NM)으로 한 번에 한 곳씩만 조회된다. 그래서 경로가 어느 장소
 * 근처인지 먼저 알아야 하고, 그러려면 장소 목록과 좌표가 필요하다.
 *
 * 아래는 **씨앗 목록**이다. 전체 120여 곳은 서울 열린데이터광장의 장소 목록에서
 * 받아 이 배열을 대체해야 한다. 목록에 없는 동네를 지나면 혼잡도를 모르는 것이고,
 * 그때는 중립값으로 떨어진다 — 틀린 값을 지어내지 않는다.
 */

import type { LatLng } from '../../domain/types';

export interface Hotspot {
  /** API에 그대로 넘기는 장소명 */
  areaName: string;
  at: LatLng;
}

/** 이 반경 안이면 그 장소의 혼잡도를 적용한다 (m). */
export const HOTSPOT_RADIUS_M = 700;

export const SEOUL_HOTSPOTS: Hotspot[] = [
  { areaName: '광화문·덕수궁', at: { lat: 37.5709, lng: 126.9769 } },
  { areaName: '강남역', at: { lat: 37.4979, lng: 127.0276 } },
  { areaName: '홍대 관광특구', at: { lat: 37.5563, lng: 126.9236 } },
  { areaName: '성수카페거리', at: { lat: 37.5445, lng: 127.0557 } },
  { areaName: '여의도', at: { lat: 37.5219, lng: 126.9245 } },
  { areaName: '잠실 관광특구', at: { lat: 37.5133, lng: 127.1 } },
  { areaName: '이태원 관광특구', at: { lat: 37.5345, lng: 126.9947 } },
  { areaName: '연남동', at: { lat: 37.5606, lng: 126.9256 } },
  { areaName: '북촌한옥마을', at: { lat: 37.5826, lng: 126.9831 } },
  { areaName: '서울역', at: { lat: 37.5547, lng: 126.9707 } },
];

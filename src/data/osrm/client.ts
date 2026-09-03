/**
 * 키 없는 실제 도로망 보행 경로 — FOSSGIS OSRM.
 *
 * TMAP 키가 없거나 TMAP이 실패한 날의 뒷배다. 예전엔 그 자리에 좌표를 **지어내는**
 * 공급자가 있었고, 그래서 산을 가로지르는 삼각형이 사용자 화면에 떴다.
 * 여기서는 무슨 일이 있어도 좌표를 만들지 않는다 — 도로망이 준 것만 넘기고,
 * 못 받으면 던진다.
 *
 * `ParsedRoute`를 돌려주므로 TMAP과 같은 배관을 그대로 탄다.
 */

import { getApiConfig } from '../../config';
import { requestJson } from '../http';
import type { ParsedRoute } from '../tmap/parse';
import type { LatLng } from '../../domain/types';
import { distanceM } from '../../domain/geo';
import { ApiError } from '../http';

/**
 * 경유지가 도로망에서 이만큼 넘게 떨어져 있으면 그 경로는 버린다 (m).
 *
 * OSRM의 가장 위험한 성질이 여기 있다. **닿을 수 없는 좌표에도 에러를 주지 않는다.**
 * 실측으로 확인했다 — 남해 바다 한가운데 두 점을 넣었더니 `code: "Ok"`와 함께
 * 15.4m짜리 '경로'를 돌려줬다. 두 점을 각각 28km, 35km 떨어진 육지 도로로
 * **말없이 끌어다 붙인** 것이다. 그대로 믿으면 사용자가 있지도 않은 곳에서
 * 출발하는 길을 받는다.
 *
 * 응답의 `waypoints[].distance`가 그 끌어당긴 거리를 알려준다. 정상적인 도심
 * 좌표는 6~10m였고(실측), 산자락처럼 도로가 성긴 곳도 140m 안쪽이었다.
 * 250m는 그보다 넉넉하면서 28km짜리 거짓말과는 자릿수로 떨어져 있다.
 */
const MAX_SNAP_M = 250;

interface OsrmWaypoint {
  distance?: number;
}

interface OsrmRoute {
  distance: number;
  duration: number;
  geometry: { coordinates: [number, number][] };
}

interface OsrmResponse {
  code: string;
  routes?: OsrmRoute[];
  waypoints?: OsrmWaypoint[];
}

/** OSRM 좌표는 [경도, 위도] 순서다. TMAP과 같다 — 뒤집으면 지구 반대편으로 간다. */
function toLatLng([lng, lat]: [number, number]): LatLng {
  return { lat, lng };
}

export interface OsrmQuery {
  origin: LatLng;
  destination: LatLng;
  /** 지나갈 곳. 길을 늘릴 때 쓴다. OSRM은 경로 중간 좌표로 받는다. */
  waypoints?: LatLng[];
}

/**
 * 보행 경로 하나.
 *
 * 실패는 전부 던진다 — 부르는 쪽이 "실패했으니 다른 걸 쓰자"를 판단할 수 있어야지,
 * 여기서 빈 경로나 그럴듯한 대용품을 돌려주면 그게 곧 예전의 그 버그가 된다.
 */
export async function fetchOsrmRoute({
  origin,
  destination,
  waypoints = [],
}: OsrmQuery): Promise<ParsedRoute> {
  const { osrmRoute } = getApiConfig();

  // 경도,위도 순서. 사이는 세미콜론.
  const coords = [origin, ...waypoints, destination]
    .map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`)
    .join(';');

  // overview=full이 아니면 좌표가 확 줄어 실제 길 모양을 잃는다(실측: 264점 → 22점).
  const response = await requestJson<OsrmResponse>(
    `${osrmRoute.baseUrl}/route/v1/foot/${coords}?overview=full&geometries=geojson`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        // 없으면 403으로 거절당한다(실측). 누가 부르는지 밝히라는 뜻이다.
        'User-Agent': osrmRoute.userAgent,
      },
    }
  );

  if (response.code !== 'Ok') {
    // 도로망에 안 붙는 경유지는 여기로 온다(`NoSegment`). 정상적인 거절이다.
    throw new ApiError(`길을 찾지 못했어요 (${response.code})`, null);
  }

  const route = response.routes?.[0];
  if (route == null) {
    throw new ApiError('길을 찾지 못했어요', null);
  }

  // 끌어당긴 거리를 먼저 본다. 이 검사가 없으면 바다 좌표에도 '경로'가 나온다.
  const snapped = response.waypoints ?? [];
  for (const waypoint of snapped) {
    if (waypoint.distance != null && waypoint.distance > MAX_SNAP_M) {
      throw new ApiError('그 근처에는 걸을 수 있는 길이 없어요', null);
    }
  }

  const path = (route.geometry?.coordinates ?? []).map(toLatLng);
  // 점 하나로는 길이 아니다. 여기서 막지 않으면 걷는 화면이 좌표 없이 열린다.
  if (path.length < 2) {
    throw new ApiError('길을 찾지 못했어요', null);
  }

  /*
   * 받은 길이 **우리가 물어본 자리**에서 시작하고 끝나는지 직접 본다.
   *
   * 위의 `waypoints` 검사만으로는 모자란다. 그 필드는 서버가 넣어 줄 때만 있고,
   * `skip_waypoints`를 켠 인스턴스나 중간에 끼는 프록시가 벗겨 내면 배열이 비어
   * 루프가 한 번도 안 돈다 — 그러면 28km 밖에서 주워 온 좌표가 그대로 통과한다.
   * 서버가 자진해서 알려 주는 값에 안전을 걸어 두지 않는다.
   *
   * 시작·끝 좌표는 응답에 언제나 있으므로 우리가 직접 잰다.
   */
  if (
    distanceM(path[0], origin) > MAX_SNAP_M ||
    distanceM(path[path.length - 1], destination) > MAX_SNAP_M
  ) {
    throw new ApiError('그 근처에는 걸을 수 있는 길이 없어요', null);
  }

  return {
    path,
    distanceM: route.distance,
    durationSec: Math.round(route.duration),
    /*
     * OSRM은 횡단보도·계단을 세어 주지 않는다. 0으로 적으면 "횡단보도가 하나도
     * 없는 길"이라는 **거짓말**이 되어, 신호에 자주 걸리는 길에 대고
     * "생각이 안 끊기는 길이에요"라고 말하게 된다.
     * 모르는 건 모른다고 둔다 — `deriveFeatures`가 중립값으로 받는다.
     */
    crossings: null,
    stairs: null,
  };
}

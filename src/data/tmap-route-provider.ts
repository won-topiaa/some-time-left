/**
 * TMAP 보행자 경로안내로 만든 공급자.
 *
 * 후보를 만드는 일 자체는 `RoadRouteProvider`가 한다 — TMAP이든 OSRM이든
 * 도로망을 부르는 방법만 다르고 나머지(겨냥·보정 라운드·성질 계산·관문)는
 * 같아야 하기 때문이다. 여기는 "TMAP으로 부른다"만 말한다.
 */

import { fetchPedestrianRoute } from './tmap/client';
import { RoadRouteProvider } from './road-route-provider';

// 겨냥 값은 여기서 정하지 않는다. 두 공급자가 같은 값을 써야 해서 한 군데에 있다.
export { aimSec } from './road-route-provider';

export class TmapRouteProvider extends RoadRouteProvider {
  constructor() {
    super({ fetchRoute: fetchPedestrianRoute, idPrefix: 'tmap' });
  }
}

/**
 * 키 없이 도는 공급자 — FOSSGIS OSRM 보행 프로파일.
 *
 * TMAP 키가 없는 번들(심사용이 그렇다)이 여기로 온다. 예전엔 그 자리에 좌표를
 * **지어내는** 공급자가 있었고, 그래서 산자락을 가로지르는 삼각형이 "3분 전에는
 * 닿는 길이에요"와 함께 실기기에 떴다. 키가 없다는 것이 거짓말을 해도 된다는
 * 뜻은 아니다 — 키가 없으면 조금 못한 진짜를 쓰면 된다.
 */

import { fetchOsrmRoute } from './osrm/client';
import { RoadRouteProvider } from './road-route-provider';

/**
 * 후보 요청 사이 간격 (ms).
 *
 * FOSSGIS는 남의 무료 서버이고 정책이 "초당 1회, 과용 금지"다. 후보 여섯을
 * 한꺼번에 던지면 그 자리에서 여섯 배로 어긴다. 250ms씩 어긋내면 한 라운드가
 * 1.25초에 걸쳐 나가 정책에 훨씬 가깝고, 길을 기다리는 사람에게도 견딜 만하다.
 * (병렬로 기다리므로 전체 대기는 간격 + 응답 한 번어치만 늘어난다)
 */
const REQUEST_SPACING_MS = 250;

export class OsrmRouteProvider extends RoadRouteProvider {
  constructor() {
    super({
      fetchRoute: fetchOsrmRoute,
      idPrefix: 'osrm',
      requestSpacingMs: REQUEST_SPACING_MS,
    });
  }
}

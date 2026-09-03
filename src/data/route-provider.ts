/**
 * 경로 공급자의 계약.
 *
 * 구현은 전부 **실제 도로망**에서 온다 — `TmapRouteProvider`(키 있음),
 * `OsrmRouteProvider`(키 없음). 둘 다 `RoadRouteProvider`를 통해 같은 겨냥·보정·
 * 관문을 지난다.
 *
 * ## 여기 mock이 없는 이유
 *
 * 예전엔 이 파일에 화면 개발용 `MockRouteProvider`가 있었다. 출발점과 도착점
 * 사이에 옆으로 벌린 점을 하나 찍고 **직선 다섯 개로 이어** 경로라고 내놓는
 * 코드였다. 도로망을 한 번도 보지 않았다.
 *
 * 그리고 그것이 실기기에 나갔다. `scripts/ensure-local-config.mjs`가 빌드마다
 * 키가 null인 설정을 자동으로 만들고, 키가 없으면 mock으로 떨어지는 삼항 연산자가
 * 하나 있었을 뿐이다 — 사고가 아니라 파이프라인의 정상 출력이었다. 사용자는
 * 산자락을 가로지르는 삼각형을 "3분 전에는 닿는 길이에요"라는 문장과 함께 받았다.
 *
 * 게다가 그 좌표는 화면에서 끝나지 않았다. 기록으로 **저장되고**, 앱 밖으로
 * 공유되고, 다음 추천의 `previousPaths`로 되돌아와 진짜 경로의 novelty를 깎았다.
 *
 * 그래서 지웠다. 되살리지 말 것. 개발 중에 도로망을 안 부르고 싶다면 공급자를
 * 지어내지 말고 **응답을 고정**해라(`fetchRoute`를 갈아 끼우면 된다) — 그러면
 * 좌표는 여전히 진짜 도로에서 온 것이고, 화면에 거짓말이 뜨지 않는다.
 */

import type { LatLng, RouteCandidate } from '../domain/types';

export interface RouteRequest {
  origin: LatLng;
  destination: LatLng;
  /** 이 정도 걸리는 경로를 원한다 (초) */
  targetSec: number;
  /** 출발 시각 (epoch ms). 그늘 계산이 시각에 의존한다. */
  departAtMs: number;
  /** 과거 걸은 경로 좌표. novelty 계산에 쓴다. 밖에서 한 번만 읽어 넘긴다. */
  previousPaths?: LatLng[][];
}

export interface RouteProvider {
  /** 최단 경로 하나. 시간 예산 계산의 기준점. */
  shortest(origin: LatLng, destination: LatLng): Promise<RouteCandidate>;
  /** 목표 시간 근처의 후보들. 많을수록 좋지만 5~8개면 충분하다. */
  candidates(request: RouteRequest): Promise<RouteCandidate[]>;
}

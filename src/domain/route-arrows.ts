/**
 * 남은 길 위에 놓는 방향 화살표.
 *
 * **왜 필요한가.** 걷는 화면의 지도에는 선 하나와 점 두 개뿐이었다. 출발점은 속이
 * 비고 도착점은 차 있어서 원칙적으로는 구분이 되지만, 실기기에서 보면 5px짜리 원
 * 두 개의 차이라 어느 쪽으로 걸어야 하는지 알 수 없다 — 실제로 그 피드백을 받았다.
 * 걷는 중에 흘깃 보는 화면에서 방향은 읽어 내는 것이 아니라 보이는 것이어야 한다.
 *
 * **왜 삼각형을 직접 계산하나.** MapLibre로 화살표를 그리는 흔한 방법은 심볼
 * 레이어(`icon-image`나 `text-field`)인데, 둘 다 스타일이 주는 스프라이트·글리프에
 * 기댄다. 이 지도에는 스타일을 못 받았을 때 종이 한 장짜리 빈 스타일로 갈아타는
 * 길이 있고(`BLANK`), 그 위에는 스프라이트도 글리프도 없다. 화살표가 그때 사라지면
 * 하필 지도가 가장 빈약한 순간에 방향을 잃는다. 폴리곤은 아무것에도 안 기댄다.
 */

import { bearingDeg, distanceM, interpolate, offsetPoint, pathLengthM } from './geo';
import type { LatLng } from './types';

const DEG = Math.PI / 180;

/**
 * 아무리 많아도 이만큼까지만 놓는다.
 *
 * 간격은 **경계 상자** 기준이라 화면상의 크기는 일정하지만, 길이는 상자와 상관없이
 * 길어질 수 있다 — 좁은 동네 안에서 이리저리 꺾어 늘린 경로가 그렇다. 실측으로
 * 133m짜리 상자 안의 40km 경로에서 화살표가 1,873개 나왔고, GeoJSON으로 만들면
 * 470KB다. 그 문자열이 위치가 들어올 때마다(3초·5m) 웹뷰로 주입된다.
 *
 * 자투리 시간을 걷게 하려고 늘리는 상한을 40분까지 올린 뒤로 경로는 더 길고 더
 * 굽어졌다. 늘리는 쪽을 열어 둔 만큼 이쪽에는 천장을 둔다.
 *
 * 40개면 굽은 길에서도 갈림길마다 하나씩은 놓인다. 그때 GeoJSON은 11.2KB다(실측) —
 * 앞의 470KB와 견주면 자릿수가 다르고, 이 숫자가 천장을 다시 정할 때의 기준이다.
 */
const MAX_ARROWS = 40;

export interface RouteArrow {
  /** 화살표가 놓이는 자리 */
  at: LatLng;
  /** 진행 방위각 (도, 북=0, 시계방향) */
  headingDeg: number;
  /** 경로 전체에서의 위치 (0~1). 지나온 화살표를 걷어내는 데 쓴다. */
  alongRatio: number;
}

/**
 * 경로를 따라 일정 간격으로 화살표를 놓는다.
 *
 * **경로 전체를 기준으로 한 번만 계산한다.** 남은 구간에만 새로 놓으면 걸음마다
 * 화살표가 재배치되어 지도가 들썩인다. 자리는 땅에 박아 두고, 지나간 것만
 * `alongRatio`로 걷어내는 편이 조용하다.
 */
export function routeArrows(path: LatLng[], spacingM: number): RouteArrow[] {
  if (path.length < 2 || !(spacingM > 0)) {
    return [];
  }
  const totalM = pathLengthM(path);
  if (!(totalM > 0)) {
    return [];
  }

  /*
   * 개수가 천장을 넘으면 간격을 벌린다.
   *
   * 보통 경로에서는 이 줄이 아무 일도 안 한다 — 1km짜리 길의 간격은 160m쯤인데
   * 천장이 요구하는 최소 간격은 27m라 원래 값이 그대로 이긴다. 상자에 비해 길이
   * 유난히 긴 경로에서만 걸린다.
   */
  const step = Math.max(spacingM, totalM / MAX_ARROWS);

  const arrows: RouteArrow[] = [];
  /*
   * 첫 화살표를 반 칸 띄워 놓는다. 0에서 시작하면 출발점 위에 겹쳐 앉아
   * 비어 있어야 할 출발 표시를 가린다.
   */
  let next = step / 2;
  let travelled = 0;

  for (let i = 1; i < path.length; i += 1) {
    const from = path[i - 1];
    const to = path[i];
    const legM = distanceM(from, to);
    if (legM <= 0) {
      continue;
    }
    // 같은 구간 안에 여러 개가 들어갈 수 있다 — 긴 직선에서 그렇다.
    while (next <= travelled + legM) {
      const t = (next - travelled) / legM;
      arrows.push({
        at: interpolate(from, to, t),
        headingDeg: bearingDeg(from, to),
        alongRatio: next / totalM,
      });
      next += step;
    }
    travelled += legM;
  }

  /*
   * 간격이 길이보다 크면 하나도 안 놓인다. 짧은 길이야말로 방향이 헷갈리므로
   * 그때는 가운데에 하나만 둔다.
   */
  if (arrows.length === 0) {
    return midArrow(path, totalM);
  }
  return arrows;
}

function midArrow(path: LatLng[], totalM: number): RouteArrow[] {
  let travelled = 0;
  const half = totalM / 2;
  for (let i = 1; i < path.length; i += 1) {
    const from = path[i - 1];
    const to = path[i];
    const legM = distanceM(from, to);
    if (legM <= 0) {
      continue;
    }
    if (travelled + legM >= half) {
      return [
        {
          at: interpolate(from, to, (half - travelled) / legM),
          headingDeg: bearingDeg(from, to),
          alongRatio: 0.5,
        },
      ];
    }
    travelled += legM;
  }
  return [];
}

/**
 * 화살표 하나를 폴리곤 링으로.
 *
 * 진행 방향으로 뾰족하고 뒤가 벌어진 모양이다. 꼬리를 안쪽으로 살짝 파면
 * (`NOTCH`) 작은 크기에서도 삼각형이 아니라 화살표로 읽힌다.
 *
 * **링을 여기서 닫는다.** GeoJSON 폴리곤은 첫 점과 끝 점이 같아야 하고, 안 닫으면
 * MapLibre가 오류 없이 그 도형을 통째로 안 그린다. 닫는 일을 그리는 쪽에 맡기면
 * 검사할 수 없는 자리에 조용한 실패 하나를 두는 셈이라 여기서 끝낸다.
 */
export function arrowPolygon(arrow: RouteArrow, sizeM: number): LatLng[] {
  const heading = arrow.headingDeg * DEG;
  // 진행 방향 단위벡터와 그 왼쪽.
  const fe = Math.sin(heading);
  const fn = Math.cos(heading);
  const le = -fn;
  const ln = fe;

  const half = sizeM / 2;
  const wing = sizeM * 0.42;
  const NOTCH = 0.22;

  const move = (alongM: number, sideM: number): LatLng =>
    offsetPoint(arrow.at, fe * alongM + le * sideM, fn * alongM + ln * sideM);

  const tip = move(half, 0);
  return [
    tip, // 앞코
    move(-half, wing), // 왼쪽 날개
    move(-half * NOTCH, 0), // 꼬리 홈
    move(-half, -wing), // 오른쪽 날개
    tip, // 링을 닫는다
  ];
}

/**
 * 이 경로에 어울리는 간격과 크기 (m).
 *
 * 지도는 경로의 경계 상자를 화면에 꽉 맞춰 고정한다(`fitBounds`, `interactive: false`).
 * 그래서 화면상의 크기는 **경계 상자 대비 비율**로 정해진다 — 길이에 비례해 잡으면
 * 꼬불꼬불한 길에서만 화살표가 커진다. 대각선의 일정 비율로 두면 100m짜리 골목이든
 * 3km짜리 강변이든 화면에서 같은 크기로 보인다.
 */
export function arrowMetrics(path: LatLng[]): { spacingM: number; sizeM: number } {
  if (path.length < 2) {
    return { spacingM: 0, sizeM: 0 };
  }
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const p of path) {
    west = Math.min(west, p.lng);
    east = Math.max(east, p.lng);
    south = Math.min(south, p.lat);
    north = Math.max(north, p.lat);
  }
  const diagonalM = distanceM({ lat: south, lng: west }, { lat: north, lng: east });
  if (!(diagonalM > 0)) {
    return { spacingM: 0, sizeM: 0 };
  }
  return {
    // 대각선당 예닐곱 개. 더 촘촘하면 길이 화살표에 덮이고, 더 성기면 갈림길에서 놓친다.
    spacingM: diagonalM * 0.16,
    sizeM: diagonalM * 0.05,
  };
}

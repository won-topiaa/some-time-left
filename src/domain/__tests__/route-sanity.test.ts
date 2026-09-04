import { describe, expect, it } from 'vitest';
import { inspectPath, isWalkablePath } from '../route-sanity';
import { compactPath } from '../geo';
import type { LatLng } from '../types';

/**
 * 이 관문이 있는 이유는 실기기에 실제로 뜬 화면 하나다.
 *
 * "3분 전에는 닿는 길이에요 / 24분 / 1.8km" 아래 지도에 산자락을 가로지르는
 * 삼각형이 그려져 있었다. 좌표를 지어내는 공급자가 만든 것이었다.
 *
 * 아래 픽스처는 그 사고의 양쪽 — 진짜 길과 그 삼각형 — 이고, 거기에
 * **곧게 뻗은 다리**를 더했다. 첫 관문 설계가 다리를 죽였기 때문이다.
 */

/**
 * 실측한 진짜 보행 경로. 중앙대 → 흑석역, 859m에 정점 43개.
 * 사용자가 삼각형을 본 바로 그 동네다.
 */
const REAL_WALK: LatLng[] = [
  { lat: 37.505255, lng: 126.957528 },
  { lat: 37.505297, lng: 126.957394 },
  { lat: 37.505611, lng: 126.95761 },
  { lat: 37.50579, lng: 126.957422 },
  { lat: 37.505895, lng: 126.957175 },
  { lat: 37.506047, lng: 126.957118 },
  { lat: 37.50645, lng: 126.957128 },
  { lat: 37.506534, lng: 126.957105 },
  { lat: 37.506619, lng: 126.957294 },
  { lat: 37.506728, lng: 126.957624 },
  { lat: 37.506761, lng: 126.957724 },
  { lat: 37.506802, lng: 126.957868 },
  { lat: 37.50683, lng: 126.957992 },
  { lat: 37.506856, lng: 126.958153 },
  { lat: 37.506889, lng: 126.958467 },
  { lat: 37.506931, lng: 126.958578 },
  { lat: 37.506964, lng: 126.958646 },
  { lat: 37.507089, lng: 126.958873 },
  { lat: 37.507186, lng: 126.959073 },
  { lat: 37.507215, lng: 126.959212 },
  { lat: 37.507228, lng: 126.959289 },
  { lat: 37.507259, lng: 126.959474 },
  { lat: 37.507288, lng: 126.959602 },
  { lat: 37.507503, lng: 126.960171 },
  { lat: 37.507534, lng: 126.960262 },
  { lat: 37.507621, lng: 126.960561 },
  { lat: 37.507656, lng: 126.96068 },
  { lat: 37.507676, lng: 126.96077 },
  { lat: 37.507719, lng: 126.961015 },
  { lat: 37.507686, lng: 126.961161 },
  { lat: 37.507583, lng: 126.961534 },
  { lat: 37.507623, lng: 126.961565 },
  { lat: 37.507728, lng: 126.961753 },
  { lat: 37.507867, lng: 126.962048 },
  { lat: 37.508009, lng: 126.962379 },
  { lat: 37.507978, lng: 126.962474 },
  { lat: 37.507927, lng: 126.962582 },
  { lat: 37.507898, lng: 126.962697 },
  { lat: 37.508099, lng: 126.963074 },
  { lat: 37.508312, lng: 126.963368 },
  { lat: 37.508502, lng: 126.963646 },
  { lat: 37.508646, lng: 126.963833 },
  { lat: 37.508732, lng: 126.963756 },
];

/**
 * 곧게 뻗은 다리 상판. 첫 관문 설계가 여기서 죽었다.
 *
 * 실측으로 원효대교는 한 구간이 1115m, 성산대교 944m, 동작대교 917m다. 다리
 * 보행로는 OSM에 노드가 몇 개 없어서 "정점이 성기면 가짜"라는 기준에 그대로
 * 걸렸다 — 밀도는 26~35개/km로 멀쩡한데 직선 하나가 길다는 이유였다.
 * TMAP도 직진 구간을 좌표 두 개로 주므로 같은 처지였다.
 */
const SPARSE_BRIDGE: LatLng[] = [
  { lat: 37.523, lng: 126.939 },
  // 900m 넘게 곧게 뻗은 상판. 중간에 점이 없다.
  { lat: 37.5312, lng: 126.9398 },
  { lat: 37.533, lng: 126.943 },
];

/**
 * 지워진 공급자가 만들던 모양 그대로. 점 다섯을 직선으로 이은 삼각형이다.
 *
 * 만드는 규칙도 그대로 옮겼다 — 가운데에서 옆으로 벌린 점 하나를 찍고,
 * 출발·경유지·도착 사이를 **선형 보간**한 점으로 채운다. 채운 점이 직선 위에
 * 정확히 놓인다는 것이 이 관문이 잡는 흔적이다.
 */
function fabricatedTriangle(
  origin: LatLng,
  waypoint: LatLng,
  destination: LatLng
): LatLng[] {
  const between = (a: LatLng, b: LatLng, t: number): LatLng => ({
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
  });
  return [
    origin,
    between(origin, waypoint, 0.6),
    waypoint,
    between(waypoint, destination, 0.4),
    destination,
  ];
}

/** 사용자가 실제로 본 규모. */
const ACCIDENT_SCALE = fabricatedTriangle(
  { lat: 37.5052, lng: 126.9575 },
  { lat: 37.5142, lng: 126.9553 },
  { lat: 37.5087, lng: 126.9637 }
);

describe('inspectPath — 그려진 것인가, 도로를 따라간 것인가', () => {
  it('실제 도로망 경로는 통과한다', () => {
    expect(inspectPath(REAL_WALK).ok).toBe(true);
  });

  it('곧게 뻗은 다리도 통과한다 — 성김은 가짜의 표시가 아니다', () => {
    /*
     * 첫 관문 설계(밀도·최장직선)가 정확히 여기서 진짜를 죽였다.
     * 실측으로 원효대교 1115m, 성산대교 944m, 동작대교 917m짜리 직선 구간이
     * 있고, 그 관문이라면 한강을 건너는 사람이 "길을 찾지 못했어요"를 받았다.
     */
    const result = inspectPath(SPARSE_BRIDGE);

    expect(result.ok).toBe(true);
    // 검사할 중간 점이 있는데도 공선이 아니어서 통과한 것이다.
    expect(result.testable).toBeGreaterThan(0);
    expect(result.collinear).toBe(0);
  });

  it('지어낸 삼각형은 막는다 — 실기기에 떴던 바로 그 모양', () => {
    const result = inspectPath(ACCIDENT_SCALE);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('drawn-not-routed');
  });

  it('삼각형은 크기와 무관하게 잡힌다 — 밀도로는 못 잡던 짧은 것도', () => {
    /*
     * 밀도 기준은 400m짜리 삼각형을 놓쳤다(11.8개/km라 진짜 골목과 구분 불가).
     * 보간의 흔적은 크기를 안 탄다 — 어느 규모에서든 중간 점이 직선 위에 있다.
     */
    const scales = [
      ACCIDENT_SCALE,
      fabricatedTriangle(
        { lat: 37.5052, lng: 126.9575 },
        { lat: 37.5085, lng: 126.956 },
        { lat: 37.507, lng: 126.96 }
      ),
      fabricatedTriangle(
        { lat: 37.5052, lng: 126.9575 },
        { lat: 37.507, lng: 126.9568 },
        { lat: 37.5062, lng: 126.959 }
      ),
    ];

    for (const triangle of scales) {
      expect(inspectPath(triangle).ok).toBe(false);
    }
  });

  it('진짜 경로에는 직선 위에 놓인 점이 하나도 없다', () => {
    // 실측: 진짜 경로의 최소 벗어남이 39mm였다. 문턱은 1mm다.
    expect(inspectPath(REAL_WALK).collinear).toBe(0);
    expect(inspectPath(SPARSE_BRIDGE).collinear).toBe(0);
  });

  it('점이 둘 미만이면 길이 아니다 — 빈 응답이 "0분 0.0km"로 새던 구멍', () => {
    expect(inspectPath([]).reason).toBe('too-few-points');
    expect(inspectPath([{ lat: 37.5, lng: 127 }]).reason).toBe('too-few-points');
  });

  it('제자리 좌표는 길이 아니다', () => {
    const spot = { lat: 37.5, lng: 127 };

    expect(inspectPath([spot, spot]).reason).toBe('zero-length');
  });

  it('볼 점이 모자라면 판단하지 않는다 — 의심스러우면 통과시킨다', () => {
    // 점 둘짜리 짧은 골목. 검사할 중간 점이 아예 없다.
    const alley = [
      { lat: 37.5052, lng: 126.9575 },
      { lat: 37.5063, lng: 126.9575 },
    ];
    const result = inspectPath(alley);

    expect(result.testable).toBe(0);
    expect(result.ok).toBe(true);
  });

  it('기록으로 솎아 저장한 뒤에도 진짜 경로는 통과한다', () => {
    /*
     * 이걸 안 보면 관문이 제 발등을 찍는다. 기록은 `compactPath`가 25m 간격으로
     * 솎아 저장하고, 그 좌표가 `previousPaths`로 돌아와 다시 이 관문을 지난다.
     * 여기서 걸리면 제가 저장한 진짜 기록을 제가 버리고, 매일 걷는 길에
     * "아직 안 가보신 길이에요"라고 하게 된다.
     */
    for (const real of [REAL_WALK, SPARSE_BRIDGE]) {
      expect(isWalkablePath(compactPath(real))).toBe(true);
    }
  });
});

/**
 * NaN 앞에서 관문이 통째로 열려 있었다.
 *
 * NaN이 낀 비교는 무엇이든 거짓이라, 길이 검사도 짧은 구간 건너뛰기도 공선 판정도
 * 한꺼번에 무너진다. 좌표가 전부 undefined인 배열이 '걸을 수 있는 길'로 통과했다.
 * 지어낸 길을 막자고 세운 관문이 가장 망가진 입력에만 열려 있으면 안 된다.
 */
describe('숫자가 아닌 좌표', () => {
  it('NaN이 섞이면 통과시키지 않는다', () => {
    const path = [
      { lat: 37.5, lng: 127 },
      { lat: NaN, lng: NaN },
      { lat: 37.51, lng: 127.01 },
    ];
    expect(isWalkablePath(path)).toBe(false);
    expect(inspectPath(path).reason).toBe('not-a-place');
  });

  it('좌표가 통째로 없어도 통과시키지 않는다', () => {
    const path = [
      { lat: undefined, lng: undefined },
      { lat: undefined, lng: undefined },
    ] as unknown as Array<{ lat: number; lng: number }>;
    expect(isWalkablePath(path)).toBe(false);
    expect(inspectPath(path).reason).toBe('not-a-place');
  });

  it('점이 null이어도 던지지 않고 거절한다', () => {
    const path = [{ lat: 37.5, lng: 127 }, null, { lat: 37.51, lng: 127 }] as unknown as Array<{
      lat: number;
      lng: number;
    }>;
    expect(() => inspectPath(path)).not.toThrow();
    expect(inspectPath(path).reason).toBe('not-a-place');
  });

  it('지구 밖 좌표도 거절한다 — 숫자이긴 해도 갈 수 있는 곳이 아니다', () => {
    expect(
      inspectPath([
        { lat: 900, lng: 127 },
        { lat: 37.5, lng: 127 },
      ]).reason
    ).toBe('not-a-place');
    expect(
      inspectPath([
        { lat: 37.5, lng: 4000 },
        { lat: 37.51, lng: 127 },
      ]).reason
    ).toBe('not-a-place');
  });

  it('경계값은 그대로 통과한다 — 극점과 날짜변경선은 숫자로서 멀쩡하다', () => {
    expect(
      inspectPath([
        { lat: 90, lng: 180 },
        { lat: -90, lng: -180 },
      ]).reason
    ).not.toBe('not-a-place');
  });
});

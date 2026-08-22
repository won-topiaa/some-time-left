import { SEOUL_HOTSPOTS } from '../seoul/hotspots';
import { describe, expect, it } from 'vitest';
import {
  NEUTRAL_QUIET,
  hotspotsAlong,
  parseProxyAreas,
  scoreQuiet,
  type AreaCongestion,
} from '../seoul/congestion';
import { NEUTRAL_SCENIC, parksNear, scoreScenic } from '../parks/scenic';
import { parseParkRow, type Park } from '../parks/client';
import { boundingBoxOf, parseVWorldBuildings } from '../buildings/vworld';
import { parseLedgerRow } from '../buildings/ledger';
import { buildProfileLookup, profileForSegment } from '../buildings/profile';
import { heightFromFloors } from '../buildings/types';
import { signedSideOf } from '../../domain/geo';
import type { LatLng } from '../../domain/types';

const GANGNAM: LatLng = { lat: 37.4979, lng: 127.0276 };
const SEONGSU: LatLng = { lat: 37.5445, lng: 127.0557 };
const BUSAN: LatLng = { lat: 35.1796, lng: 129.0756 };

describe('hotspotsAlong', () => {
  it('경로가 지나는 장소만 고른다 — API가 한 번에 한 곳씩만 받으니까', () => {
    const found = hotspotsAlong([GANGNAM]);

    expect(found.map((h) => h.areaName)).toContain('강남역');
    expect(found.map((h) => h.areaName)).not.toContain('성수카페거리');
  });

  it('아무 장소에도 안 걸리면 빈 목록', () => {
    expect(hotspotsAlong([BUSAN])).toEqual([]);
  });
});

describe('parseProxyAreas', () => {
  it('프록시 응답에 좌표를 붙인다', () => {
    const areas = parseProxyAreas({
      areas: [{ areaName: '강남역', level: '붐빔', updatedAt: '2026-08-18 03:20' }],
    });

    expect(areas).toHaveLength(1);
    expect(areas[0].level).toBe('붐빔');
    // 좌표는 목록에서 온다. 숫자를 손으로 적어 두면 목록을 갱신하는 날 테스트만 옛말을 한다.
    const gangnam = SEOUL_HOTSPOTS.find((h) => h.areaName === '강남역');
    expect(areas[0].at).toEqual(gangnam?.at);
  });

  it('우리 좌표 목록에 없는 장소는 버린다 — 경로와 대조할 수 없다', () => {
    expect(parseProxyAreas({ areas: [{ areaName: '모르는곳', level: '여유' }] })).toEqual([]);
  });

  it('알 수 없는 등급은 버린다', () => {
    expect(parseProxyAreas({ areas: [{ areaName: '강남역', level: '한산' }] })).toEqual([]);
  });

  it('빈 응답에도 죽지 않는다', () => {
    expect(parseProxyAreas({})).toEqual([]);
  });
});

describe('scoreQuiet', () => {
  const busy: AreaCongestion = { areaName: '강남역', at: GANGNAM, level: '붐빔' };
  const calm: AreaCongestion = { areaName: '성수카페거리', at: SEONGSU, level: '여유' };

  it('데이터가 없으면 중립값이다 — 모르는 걸 아는 척하지 않는다', () => {
    expect(scoreQuiet([GANGNAM], [])).toBe(NEUTRAL_QUIET);
    expect(scoreQuiet([], [busy])).toBe(NEUTRAL_QUIET);
  });

  it('붐비는 곳을 지나면 점수가 낮다', () => {
    expect(scoreQuiet([GANGNAM], [busy])).toBe(0);
  });

  it('한적한 곳을 지나면 점수가 높다', () => {
    expect(scoreQuiet([SEONGSU], [calm])).toBe(1);
  });

  it('붐비는 곳을 스쳐 지나가는 정도면 크게 깎이지 않는다', () => {
    // 좌표 10개 중 하나만 강남역 근처
    const path = [GANGNAM, ...Array.from({ length: 9 }, () => BUSAN)];
    const score = scoreQuiet(path, [busy]);

    expect(score).toBeGreaterThan(0.4);
  });

  it('사정권 밖의 장소는 영향을 주지 않는다', () => {
    expect(scoreQuiet([BUSAN], [busy])).toBe(NEUTRAL_QUIET);
  });
});

describe('parseParkRow', () => {
  it('좌표가 없는 행은 버린다', () => {
    expect(parseParkRow({ parkNm: '어딘가', latitude: '', longitude: '' })).toBeNull();
    expect(parseParkRow({ parkNm: '어딘가', latitude: '0', longitude: '0' })).toBeNull();
  });

  it('공원구분으로 수변을 가려낸다', () => {
    const waterside = parseParkRow({
      parkNm: '한강시민공원',
      parkSe: '수변공원',
      latitude: '37.52',
      longitude: '126.93',
      parkAr: '500000',
    });

    expect(waterside?.waterfront).toBe(true);
  });

  it('이름에 물이 들어가도 수변으로 본다', () => {
    const byName = parseParkRow({
      parkNm: '중랑천 산책로',
      parkSe: '근린공원',
      latitude: '37.6',
      longitude: '127.07',
    });

    expect(byName?.waterfront).toBe(true);
  });

  it('일반 공원은 수변이 아니다', () => {
    const normal = parseParkRow({
      parkNm: '서울숲',
      parkSe: '근린공원',
      latitude: '37.5445',
      longitude: '127.0374',
      parkAr: '480000',
    });

    expect(normal?.waterfront).toBe(false);
    expect(normal?.areaM2).toBe(480000);
  });
});

describe('scoreScenic', () => {
  const bigPark: Park = {
    name: '서울숲',
    at: SEONGSU,
    areaM2: 480000,
    category: '근린공원',
    waterfront: false,
  };
  const tinyPark: Park = { ...bigPark, name: '쌈지공원', areaM2: 300 };
  const waterPark: Park = { ...bigPark, name: '한강공원', waterfront: true };

  it('공원 데이터가 없으면 중립값', () => {
    expect(scoreScenic([SEONGSU], [])).toBe(NEUTRAL_SCENIC);
  });

  it('공원 옆을 걸으면 점수가 높다', () => {
    expect(scoreScenic([SEONGSU], [bigPark])).toBeGreaterThan(0.8);
  });

  it('멀리 있는 공원은 소용이 없다', () => {
    expect(scoreScenic([BUSAN], [bigPark])).toBe(0);
  });

  it('큰 공원이 작은 공원보다 높게 쳐진다', () => {
    expect(scoreScenic([SEONGSU], [bigPark])).toBeGreaterThan(
      scoreScenic([SEONGSU], [tinyPark])
    );
  });

  it('물가는 조금 더 쳐준다', () => {
    expect(scoreScenic([SEONGSU], [waterPark])).toBeGreaterThanOrEqual(
      scoreScenic([SEONGSU], [bigPark])
    );
  });

  it('1을 넘지 않는다', () => {
    expect(scoreScenic([SEONGSU], [waterPark, bigPark, tinyPark])).toBeLessThanOrEqual(1);
  });

  it('parksNear가 사정권 밖 공원을 미리 걸러낸다', () => {
    const far: Park = { ...bigPark, at: BUSAN };
    expect(parksNear([bigPark, far], [SEONGSU])).toEqual([bigPark]);
  });
});

describe('signedSideOf', () => {
  // 남 → 북으로 가는 선분
  const from: LatLng = { lat: 37.5, lng: 127.0 };
  const to: LatLng = { lat: 37.51, lng: 127.0 };

  it('진행 방향 오른쪽(동쪽)이 양수다', () => {
    const east = signedSideOf(from, to, { lat: 37.505, lng: 127.001 });
    expect(east.distanceM).toBeGreaterThan(0);
  });

  it('진행 방향 왼쪽(서쪽)이 음수다', () => {
    const west = signedSideOf(from, to, { lat: 37.505, lng: 126.999 });
    expect(west.distanceM).toBeLessThan(0);
  });

  it('선분 위 투영 위치를 준다', () => {
    const mid = signedSideOf(from, to, { lat: 37.505, lng: 127.0 });
    expect(mid.alongRatio).toBeCloseTo(0.5, 2);
    expect(Math.abs(mid.distanceM)).toBeLessThan(1);
  });

  it('선분 밖이면 0~1을 벗어난다', () => {
    expect(signedSideOf(from, to, { lat: 37.49, lng: 127.0 }).alongRatio).toBeLessThan(0);
    expect(signedSideOf(from, to, { lat: 37.52, lng: 127.0 }).alongRatio).toBeGreaterThan(1);
  });
});

describe('profileForSegment', () => {
  const from: LatLng = { lat: 37.5, lng: 127.0 };
  const to: LatLng = { lat: 37.51, lng: 127.0 };

  it('건물이 없으면 기본 단면으로 떨어진다', () => {
    const profile = profileForSegment(from, to, []);
    expect(profile.leftHeightM).toBe(15);
    expect(profile.rightHeightM).toBe(15);
  });

  it('좌우 건물을 갈라서 높이를 매긴다', () => {
    const profile = profileForSegment(from, to, [
      { at: { lat: 37.505, lng: 126.9997 }, floors: 10, heightM: 33 }, // 서쪽 = 왼쪽
      { at: { lat: 37.505, lng: 127.0003 }, floors: 3, heightM: 9.9 }, // 동쪽 = 오른쪽
    ]);

    expect(profile.leftHeightM).toBeCloseTo(33, 1);
    expect(profile.rightHeightM).toBeCloseTo(9.9, 1);
  });

  it('멀리 있는 건물은 그림자를 드리우지 않는다', () => {
    const profile = profileForSegment(from, to, [
      { at: BUSAN, floors: 60, heightM: 198 },
    ]);

    expect(profile.leftHeightM).toBe(15);
  });

  it('최고층 하나에 휘둘리지 않고 상위 몇 개를 평균한다', () => {
    const west = (floors: number, offset: number) => ({
      at: { lat: 37.502 + offset, lng: 126.9997 },
      floors,
      heightM: heightFromFloors(floors),
    });

    const profile = profileForSegment(from, to, [
      west(30, 0),
      west(3, 0.001),
      west(3, 0.002),
      west(3, 0.003),
    ]);

    // 30층 하나가 있어도 평균이 그 아래로 내려온다
    expect(profile.leftHeightM).toBeLessThan(heightFromFloors(30));
    expect(profile.leftHeightM).toBeGreaterThan(heightFromFloors(3));
  });

  it('buildProfileLookup은 구간 인덱스로 조회된다', () => {
    const path = [from, to, { lat: 37.52, lng: 127.0 }];
    const lookup = buildProfileLookup(path, [
      { at: { lat: 37.505, lng: 126.9997 }, floors: 10, heightM: 33 },
    ]);

    expect(lookup(0).leftHeightM).toBeCloseTo(33, 1);
    // 범위를 벗어난 인덱스도 죽지 않는다
    expect(lookup(99).leftHeightM).toBe(15);
  });
});

describe('parseVWorldBuildings', () => {
  it('폴리곤에서 대표 좌표와 층수를 뽑는다', () => {
    const buildings = parseVWorldBuildings(
      {
        response: {
          result: {
            featureCollection: {
              features: [
                {
                  geometry: {
                    type: 'Polygon',
                    coordinates: [
                      [
                        [127.0276, 37.4979],
                        [127.0277, 37.4979],
                        [127.0277, 37.498],
                      ],
                    ],
                  },
                  properties: { gro_flo_co: 12 },
                },
              ],
            },
          },
        },
      },
      'gro_flo_co'
    );

    expect(buildings).toHaveLength(1);
    expect(buildings[0].at).toEqual({ lat: 37.4979, lng: 127.0276 });
    expect(buildings[0].floors).toBe(12);
    expect(buildings[0].heightM).toBeCloseTo(39.6, 1);
  });

  it('층수가 없는 건물은 버린다 — 그늘 계산에 쓸 수 없다', () => {
    const buildings = parseVWorldBuildings(
      {
        response: {
          result: {
            featureCollection: {
              features: [
                {
                  geometry: { type: 'Point', coordinates: [127.0, 37.5] },
                  properties: {},
                },
              ],
            },
          },
        },
      },
      'gro_flo_co'
    );

    expect(buildings).toEqual([]);
  });

  it('빈 응답에도 죽지 않는다', () => {
    expect(parseVWorldBuildings({}, 'gro_flo_co')).toEqual([]);
  });
});

describe('boundingBoxOf', () => {
  it('경로를 감싸고 여유를 둔다', () => {
    const box = boundingBoxOf([GANGNAM, SEONGSU]);

    expect(box).not.toBeNull();
    expect(box!.minLat).toBeLessThan(GANGNAM.lat);
    expect(box!.maxLat).toBeGreaterThan(SEONGSU.lat);
  });

  it('빈 경로면 null', () => {
    expect(boundingBoxOf([])).toBeNull();
  });
});

describe('parseLedgerRow', () => {
  it('대장에 실측 높이가 있으면 그 값을 쓴다', () => {
    const building = parseLedgerRow({ bldNm: '어느 빌딩', grndFlrCnt: 10, heit: 42.5 });
    expect(building?.heightM).toBe(42.5);
  });

  it('높이가 0으로 오면 층수로 환산한다 — 흔한 경우다', () => {
    const building = parseLedgerRow({ bldNm: '어느 빌딩', grndFlrCnt: 10, heit: 0 });
    expect(building?.heightM).toBeCloseTo(33, 1);
  });

  it('층수도 높이도 없으면 버린다', () => {
    expect(parseLedgerRow({ bldNm: '빈 행' })).toBeNull();
  });
});

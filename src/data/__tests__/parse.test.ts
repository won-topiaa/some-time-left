import { describe, expect, it } from 'vitest';
import {
  MAX_PASS_POINTS,
  parsePedestrianResponse,
  parsePoi,
  toPassList,
  toStreetSegments,
} from '../tmap/parse';
import type { TmapPedestrianResponse } from '../tmap/types';

/** 실제 TMAP 응답 모양을 줄인 샘플. 광화문 → 시청 방향. */
const SAMPLE: TmapPedestrianResponse = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [126.9769, 37.5759] },
      properties: {
        totalDistance: 1080,
        totalTime: 864,
        pointType: 'SP',
        description: '출발지',
      },
    },
    {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [126.9769, 37.5759],
          [126.9771, 37.5732],
        ],
      },
      properties: { distance: 300, time: 240, description: '세종대로를 따라 직진' },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [126.9771, 37.5732] },
      properties: { pointType: 'GP', description: '횡단보도 후 직진', turnType: 211 },
    },
    {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          // 구간 경계에서 같은 점이 다시 온다
          [126.9771, 37.5732],
          [126.9775, 37.5695],
          [126.9779, 37.5663],
        ],
      },
      properties: { distance: 780, time: 624, description: '계단을 올라 직진' },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [126.9779, 37.5663] },
      properties: { pointType: 'EP', description: '도착지' },
    },
  ],
};

describe('parsePedestrianResponse', () => {
  it('총 거리와 소요 시간을 출발 지점 피처에서 읽는다', () => {
    const parsed = parsePedestrianResponse(SAMPLE);

    expect(parsed.distanceM).toBe(1080);
    expect(parsed.durationSec).toBe(864);
  });

  it('LineString만 이어 붙이고 경계의 중복 좌표를 지운다', () => {
    const parsed = parsePedestrianResponse(SAMPLE);

    // 2 + 3 = 5개지만 경계에서 하나가 겹친다
    expect(parsed.path).toHaveLength(4);
    expect(parsed.path[0]).toEqual({ lat: 37.5759, lng: 126.9769 });
    expect(parsed.path[3]).toEqual({ lat: 37.5663, lng: 126.9779 });
  });

  it('좌표 순서를 뒤집지 않는다 — TMAP은 [경도, 위도]다', () => {
    const parsed = parsePedestrianResponse(SAMPLE);

    // 서울은 위도 37, 경도 127 부근. 뒤집히면 바로 드러난다.
    for (const point of parsed.path) {
      expect(point.lat).toBeGreaterThan(30);
      expect(point.lat).toBeLessThan(45);
      expect(point.lng).toBeGreaterThan(120);
      expect(point.lng).toBeLessThan(135);
    }
  });

  it('횡단보도와 계단을 센다', () => {
    const parsed = parsePedestrianResponse(SAMPLE);

    expect(parsed.crossings).toBe(1);
    expect(parsed.stairs).toBe(1);
  });

  it('총계가 없으면 좌표열로 직접 계산한다', () => {
    const withoutSummary: TmapPedestrianResponse = {
      type: 'FeatureCollection',
      features: SAMPLE.features.filter((f) => f.properties.totalTime == null),
    };

    const parsed = parsePedestrianResponse(withoutSummary);

    expect(parsed.distanceM).toBeGreaterThan(900);
    expect(parsed.durationSec).toBeGreaterThan(0);
  });

  it('빈 응답에도 죽지 않는다', () => {
    const parsed = parsePedestrianResponse({ type: 'FeatureCollection', features: [] });

    expect(parsed.path).toEqual([]);
    expect(parsed.distanceM).toBe(0);
  });
});

describe('toStreetSegments', () => {
  it('실제 경로에서 방위각과 길이를 얻는다', () => {
    const { path } = parsePedestrianResponse(SAMPLE);
    const segments = toStreetSegments(path);

    expect(segments).toHaveLength(3);
    // 광화문에서 시청은 거의 남쪽
    expect(segments[0].bearingDeg).toBeGreaterThan(150);
    expect(segments[0].bearingDeg).toBeLessThan(210);
    expect(segments[0].lengthM).toBeGreaterThan(100);
  });

  it('길이가 0에 가까운 구간은 버린다 — 방위각이 의미 없다', () => {
    const duplicated = [
      { lat: 37.5759, lng: 126.9769 },
      { lat: 37.57590001, lng: 126.97690001 },
      { lat: 37.5663, lng: 126.9779 },
    ];

    expect(toStreetSegments(duplicated)).toHaveLength(1);
  });
});

describe('toPassList', () => {
  it('경도,위도를 밑줄로 잇는다', () => {
    const list = toPassList([
      { lat: 37.55395475, lng: 126.92774822 },
      { lat: 37.55337145, lng: 126.9257762 },
    ]);

    expect(list).toBe('126.92774822,37.55395475_126.9257762,37.55337145');
  });

  it('상한을 넘는 경유지는 자른다', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ lat: 37 + i / 100, lng: 127 }));

    expect(toPassList(many).split('_')).toHaveLength(MAX_PASS_POINTS);
  });
});

describe('parsePoi', () => {
  it('입구 좌표를 우선한다 — 도보 목적지로는 그쪽이 정확하다', () => {
    const place = parsePoi({
      name: '어니언 성수',
      noorLat: '37.5445',
      noorLon: '127.0557',
      frontLat: '37.5446',
      frontLon: '127.0558',
      upperAddrName: '서울',
      middleAddrName: '성동구',
      lowerAddrName: '성수동2가',
    });

    expect(place.at).toEqual({ lat: 37.5446, lng: 127.0558 });
    expect(place.name).toBe('어니언 성수');
    expect(place.address).toBe('서울 성동구 성수동2가');
  });

  it('입구 좌표가 비어 있으면 중심 좌표를 쓴다', () => {
    const place = parsePoi({
      name: '어딘가',
      noorLat: '37.5',
      noorLon: '127.0',
      frontLat: '',
      frontLon: '',
    });

    expect(place.at).toEqual({ lat: 37.5, lng: 127.0 });
  });
});

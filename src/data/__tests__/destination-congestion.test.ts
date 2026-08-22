import { describe, expect, it } from 'vitest';
import { CONGESTION_WORD, nearestHotspot, parseProxyAreas } from '../seoul/congestion';
import type { Hotspot } from '../seoul/hotspots';

/** 성수카페거리(37.5445, 127.0557)와 그 이웃들. */
const HOTSPOTS: Hotspot[] = [
  { areaName: '성수카페거리', at: { lat: 37.5445, lng: 127.0557 } },
  { areaName: '잠실 관광특구', at: { lat: 37.5133, lng: 127.1 } },
  { areaName: '강남역', at: { lat: 37.4979, lng: 127.0276 } },
];

describe('nearestHotspot — 약속 장소가 어느 동네인가', () => {
  it('반경 안에서 가장 가까운 장소를 준다', () => {
    // 성수카페거리에서 200m쯤 떨어진 지점.
    const near = nearestHotspot({ lat: 37.546, lng: 127.056 }, HOTSPOTS);
    expect(near?.areaName).toBe('성수카페거리');
  });

  /*
   * 반경 밖이면 null이어야 한다. 가장 가까운 곳을 무조건 주면
   * 김포공항에서도 "강남역이 붐벼요"라고 말하게 된다 — 틀린 값을 지어내는 것이다.
   */
  it('반경 밖이면 null', () => {
    // 김포공항 근처. 어느 장소에서도 수 km 밖이다.
    expect(nearestHotspot({ lat: 37.5585, lng: 126.7906 }, HOTSPOTS)).toBeNull();
  });

  it('둘 다 반경 안이면 더 가까운 쪽', () => {
    const wide: Hotspot[] = [
      { areaName: 'A', at: { lat: 37.5, lng: 127.0 } },
      { areaName: 'B', at: { lat: 37.5, lng: 127.004 } },
    ];
    const near = nearestHotspot({ lat: 37.5, lng: 127.003 }, wide, 1000);
    expect(near?.areaName).toBe('B');
  });
});

describe('CONGESTION_WORD — 화면에 얹는 말', () => {
  it('네 등급 전부 문장에 들어갈 말이 있다', () => {
    expect(CONGESTION_WORD['여유']).toBe('한산해요');
    expect(CONGESTION_WORD['보통']).toBe('보통이에요');
    expect(CONGESTION_WORD['약간 붐빔']).toBe('조금 붐벼요');
    expect(CONGESTION_WORD['붐빔']).toBe('붐벼요');
  });
});

describe('parseProxyAreas — 프록시 응답 읽기', () => {
  it('아는 장소의 등급을 좌표와 함께 준다', () => {
    const areas = parseProxyAreas(
      { areas: [{ areaName: '성수카페거리', level: '붐빔' }] },
      HOTSPOTS
    );
    expect(areas).toHaveLength(1);
    expect(areas[0].level).toBe('붐빔');
    expect(areas[0].at.lat).toBeCloseTo(37.5445, 4);
  });

  it('모르는 등급이나 모르는 장소는 떨어뜨린다', () => {
    const areas = parseProxyAreas(
      {
        areas: [
          { areaName: '성수카페거리', level: '초만원' },
          { areaName: '모르는동네', level: '붐빔' },
        ],
      },
      HOTSPOTS
    );
    expect(areas).toHaveLength(0);
  });
});

import { describe, expect, it } from 'vitest';
import { parseFullAddrGeo } from '../tmap/geocode';
import { looksLikeAddress } from '../places';

describe('parseFullAddrGeo', () => {
  it('도로명으로 매칭되면 newLat/newLon을 쓴다', () => {
    const places = parseFullAddrGeo({
      coordinateInfo: {
        coordinate: [
          {
            newLat: '37.5006',
            newLon: '127.0364',
            lat: '',
            lon: '',
            city_do: '서울',
            gu_gun: '강남구',
            roadName: '테헤란로',
            buildingIndex: '152',
            buildingName: '강남파이낸스센터',
          },
        ],
      },
    });

    expect(places).toHaveLength(1);
    expect(places[0].at).toEqual({ lat: 37.5006, lng: 127.0364 });
    expect(places[0].name).toBe('강남파이낸스센터');
    expect(places[0].address).toBe('서울 강남구 테헤란로 152');
  });

  it('지번으로 매칭되면 lat/lon으로 떨어진다', () => {
    const places = parseFullAddrGeo({
      coordinateInfo: {
        coordinate: [
          {
            newLat: '',
            newLon: '',
            lat: '37.4979',
            lon: '127.0276',
            city_do: '서울',
            gu_gun: '강남구',
            legalDong: '역삼동',
            bunji: '737',
          },
        ],
      },
    });

    expect(places[0].at).toEqual({ lat: 37.4979, lng: 127.0276 });
    expect(places[0].address).toBe('서울 강남구 역삼동 737');
  });

  it('좌표가 0이거나 비어 있으면 버린다', () => {
    const places = parseFullAddrGeo({
      coordinateInfo: {
        coordinate: [
          { newLat: '0', newLon: '0', lat: '', lon: '' },
          { newLat: '', newLon: '', lat: '', lon: '' },
        ],
      },
    });

    expect(places).toEqual([]);
  });

  it('건물명이 없으면 주소를 이름으로 쓴다', () => {
    const places = parseFullAddrGeo({
      coordinateInfo: {
        coordinate: [
          { newLat: '37.5', newLon: '127.0', city_do: '서울', gu_gun: '중구', roadName: '세종대로' },
        ],
      },
    });

    expect(places[0].name).toBe('서울 중구 세종대로');
  });

  it('빈 응답에도 죽지 않는다', () => {
    expect(parseFullAddrGeo({})).toEqual([]);
    expect(parseFullAddrGeo({ coordinateInfo: {} })).toEqual([]);
  });
});

describe('looksLikeAddress', () => {
  it.each(['테헤란로 152', '역삼동 737', '세종대로 110', '역삼동 737-1'])(
    '"%s"는 주소로 본다',
    (query) => {
      expect(looksLikeAddress(query)).toBe(true);
    }
  );

  it.each(['성수동 어니언', '스타벅스', '서울숲'])('"%s"는 장소 이름으로 본다', (query) => {
    expect(looksLikeAddress(query)).toBe(false);
  });
});

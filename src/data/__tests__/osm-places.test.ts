import { describe, expect, it } from 'vitest';
import { parsePhotonPlaces } from '../osm-places';

/** Photon(GeoJSON) 응답의 최소 모양. 좌표는 [경도, 위도] 순서다. */
const feature = (props: Record<string, unknown>, lng = 126.9575, lat = 37.5051) => ({
  geometry: { coordinates: [lng, lat] },
  properties: props,
});

describe('parsePhotonPlaces — 키 없는 OSM 검색 응답 읽기', () => {
  it('이름·주소·좌표를 우리 모양으로 옮긴다 (경도/위도를 뒤집지 않는다)', () => {
    const [place] = parsePhotonPlaces({
      features: [
        feature({
          name: '중앙대학교',
          countrycode: 'KR',
          city: '서울',
          district: '흑석동',
          street: '흑석로',
          housenumber: '84',
        }),
      ],
    });

    expect(place.name).toBe('중앙대학교');
    expect(place.address).toBe('서울 흑석동 흑석로 84');
    expect(place.at).toEqual({ lat: 37.5051, lng: 126.9575 });
  });

  it('한국 밖 결과는 버린다', () => {
    const places = parsePhotonPlaces({
      features: [
        feature({ name: 'Chung-Ang Cafe', countrycode: 'AU' }, 151.2, -33.86),
        feature({ name: '흑석역', countrycode: 'KR' }),
      ],
    });
    expect(places.map((p) => p.name)).toEqual(['흑석역']);
  });

  it('이름이 없는 주소 히트는 도로명+번호를 이름으로 쓴다', () => {
    const [place] = parsePhotonPlaces({
      features: [feature({ countrycode: 'KR', street: '흑석로', housenumber: '84', city: '서울' })],
    });
    expect(place.name).toBe('흑석로 84');
    expect(place.address).toBe('서울');
  });

  it('시가 없으면 도(state)로 받는다', () => {
    const [place] = parsePhotonPlaces({
      features: [feature({ name: '판교역', countrycode: 'KR', state: '경기도', district: '분당구' })],
    });
    expect(place.address).toBe('경기도 분당구');
  });

  it('좌표가 깨졌거나 이름 재료가 아예 없으면 건너뛴다', () => {
    const places = parsePhotonPlaces({
      features: [
        { geometry: { coordinates: ['a', 'b'] }, properties: { name: 'x', countrycode: 'KR' } },
        { properties: { name: 'y', countrycode: 'KR' } },
        feature({ countrycode: 'KR' }),
        feature({ name: '살아남는 곳', countrycode: 'KR' }),
      ],
    });
    expect(places.map((p) => p.name)).toEqual(['살아남는 곳']);
  });

  it('빈 응답은 빈 목록', () => {
    expect(parsePhotonPlaces({})).toEqual([]);
    expect(parsePhotonPlaces({ features: [] })).toEqual([]);
  });

  it('여덟 개까지만 — 결과 상자가 담는 만큼', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      feature({ name: `곳${i}`, countrycode: 'KR' }, 127 + i * 0.001, 37.5)
    );
    expect(parsePhotonPlaces({ features: many })).toHaveLength(8);
  });
});

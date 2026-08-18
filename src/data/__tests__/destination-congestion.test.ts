import { describe, expect, it } from 'vitest';
import { matchCongestionPlace, normalizeName } from '../destination-congestion';
import { parseCongestion, CONGESTION_LABEL } from '../tmap/congestion';
import type { CongestionPlace } from '../tmap/congestion';
import type { Place } from '../tmap/parse';

const PLACES: CongestionPlace[] = [
  { poiId: '5799875', poiName: '롯데월드몰' },
  { poiId: '5411247', poiName: '스타필드하남' },
  { poiId: '214920', poiName: '신세계백화점강남점' },
];

function place(overrides: Partial<Place> = {}): Place {
  return { name: '롯데월드몰', address: '', at: { lat: 37.5133, lng: 127.1 }, ...overrides };
}

describe('matchCongestionPlace', () => {
  it('poiId가 있으면 그걸로 맞춘다', () => {
    const match = matchCongestionPlace(place({ name: '이름이 달라도', poiId: '5799875' }), PLACES);
    expect(match?.poiName).toBe('롯데월드몰');
  });

  it('poiId가 없으면 이름으로 맞춘다 — 지오코딩 결과에는 poiId가 없다', () => {
    expect(matchCongestionPlace(place(), PLACES)?.poiId).toBe('5799875');
  });

  it('공백과 구두점 차이를 넘어서 맞춘다', () => {
    expect(matchCongestionPlace(place({ name: '롯데 월드몰 ' }), PLACES)?.poiId).toBe('5799875');
    expect(matchCongestionPlace(place({ name: '신세계백화점 강남점' }), PLACES)?.poiId).toBe('214920');
  });

  it('목록에 없는 장소면 null — 대부분의 약속 장소가 여기 해당한다', () => {
    expect(matchCongestionPlace(place({ name: '성수동 어니언' }), PLACES)).toBeNull();
  });

  it('poiId가 목록에 없으면 이름으로 되짚는다', () => {
    const match = matchCongestionPlace(place({ name: '롯데월드몰', poiId: '9999999' }), PLACES);
    expect(match?.poiId).toBe('5799875');
  });

  it('이름이 비면 null', () => {
    expect(matchCongestionPlace(place({ name: '' }), PLACES)).toBeNull();
  });
});

describe('normalizeName', () => {
  it('공백·괄호·점을 지운다', () => {
    expect(normalizeName('신세계 백화점 (강남점)')).toBe('신세계백화점강남점');
  });
});

describe('parseCongestion', () => {
  it('rltm 배열의 첫 항목에서 등급을 읽는다', () => {
    const result = parseCongestion({
      status: { code: '00' },
      contents: { poiId: '5799875', rltm: [{ congestionLevel: 3 }] },
    });

    expect(result).toEqual({ poiId: '5799875', level: 3 });
  });

  it('평탄한 형태도 받는다', () => {
    const result = parseCongestion({
      status: { code: '00' },
      contents: { poiId: '5799875', congestionLevel: 4 },
    });

    expect(result?.level).toBe(4);
  });

  it('0~1 비율로 오면 4단계로 환산한다', () => {
    expect(parseCongestion({ contents: { poiId: 'x', rltm: [{ congestion: 0.1 }] } })?.level).toBe(1);
    expect(parseCongestion({ contents: { poiId: 'x', rltm: [{ congestion: 0.9 }] } })?.level).toBe(4);
  });

  it('조회 실패면 null', () => {
    expect(parseCongestion({ status: { code: '99' }, contents: { poiId: 'x' } })).toBeNull();
  });

  it('읽을 수 없으면 null — 화면에서 조용히 생략된다', () => {
    expect(parseCongestion({ contents: { poiId: 'x' } })).toBeNull();
    expect(parseCongestion({})).toBeNull();
  });

  it('모든 등급에 문구가 있다', () => {
    for (const level of [1, 2, 3, 4] as const) {
      expect(CONGESTION_LABEL[level]).toBeTruthy();
    }
  });
});

import { describe, expect, it } from 'vitest';
import { parseMetaPois, totalCountOf } from '../tmap/congestion';

/** 문서의 응답 예제를 줄인 것. */
const SAMPLE = {
  status: { code: '00', message: 'success', totalCount: 204, offset: 0, limit: 100 },
  contents: [
    { poiId: '7493463', poiName: '신세계백화점스타필드하남점' },
    { poiId: '5411247', poiName: '스타필드하남' },
    { poiId: '5799875', poiName: '롯데월드몰' },
  ],
};

describe('parseMetaPois', () => {
  it('장소 목록을 읽는다', () => {
    const places = parseMetaPois(SAMPLE);

    expect(places).toHaveLength(3);
    expect(places[0]).toEqual({ poiId: '7493463', poiName: '신세계백화점스타필드하남점' });
  });

  it('조회 실패면 빈 목록 — 에러 코드는 00이 아니다', () => {
    expect(parseMetaPois({ status: { code: '99', message: 'error' }, contents: [] })).toEqual([]);
  });

  it('poiId가 없는 행은 버린다', () => {
    const places = parseMetaPois({
      status: { code: '00' },
      contents: [{ poiName: '이름만 있음' }, { poiId: '', poiName: 'x' }],
    });

    expect(places).toEqual([]);
  });

  it('빈 응답에도 죽지 않는다', () => {
    expect(parseMetaPois({})).toEqual([]);
  });
});

describe('totalCountOf', () => {
  it('전체 건수를 읽는다', () => {
    expect(totalCountOf(SAMPLE)).toBe(204);
  });

  it('문자열로 와도 숫자로 만든다 — 문서에 string으로 적혀 있다', () => {
    expect(totalCountOf({ status: { totalCount: '204' } })).toBe(204);
  });

  it('없으면 0', () => {
    expect(totalCountOf({})).toBe(0);
  });
});

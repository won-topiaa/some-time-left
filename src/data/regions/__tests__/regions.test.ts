import { describe, expect, it } from 'vitest';
import { searchRegions } from '../search';
import { KOREA_REGIONS } from '../korea';

/**
 * "흑석동"을 쳤는데 아무것도 안 나오는 일은 다시 없어야 한다.
 *
 * 이 파일은 네트워크를 한 번도 쓰지 않는다. 여기서 통과한다는 것은 어떤 외부
 * 서비스가 죽어도, 비행기 모드여도, 지역 이름은 찾아진다는 뜻이다.
 */
describe('searchRegions — 오프라인 지역 검색', () => {
  it('사용자가 실제로 못 찾았던 동네가 나온다', () => {
    const [top] = searchRegions('흑석동');

    expect(top.name).toBe('흑석동');
    expect(top.address).toBe('서울특별시 동작구');
    // 중앙대·흑석역 일대. 몇백 m 안이면 동네로 걸어가기엔 충분하다.
    expect(top.at.lat).toBeCloseTo(37.504, 2);
    expect(top.at.lng).toBeCloseTo(126.966, 2);
  });

  it('사람들이 "지역"이라고 부르는 것들이 전부 찾아진다', () => {
    /*
     * 동·구·시·역세권 동네 이름을 섞었다. 하나라도 빠지면 그 지역에 사는
     * 사람에게는 앱이 통째로 안 되는 것이다.
     */
    for (const name of [
      '흑석동', '상도동', '노량진동', '동작구', '강남구', '성수동', '역삼동',
      '이태원동', '연남동', '판교동', '분당구', '해운대구', '중앙동',
      '서울특별시', '부산광역시', '제주시',
    ]) {
      const found = searchRegions(name);
      expect(found.length, `${name}을 못 찾음`).toBeGreaterThan(0);
      expect(found[0].name).toBe(name);
    }
  });

  it('법정동 이름이 찾아진다 — 행정동은 "상도3동"이지만 사람은 "상도동"을 친다', () => {
    /*
     * 색인 원료는 행정동 경계라 "상도동"이 없었다. 상도1~4동에서 파생해 넣었다.
     * 파생한 것의 자리는 번호 동들의 한가운데이고, 상위 구역도 같아야 한다.
     */
    const [sangdo] = searchRegions('상도동');
    expect(sangdo.name).toBe('상도동');
    expect(sangdo.address).toBe('서울특별시 동작구');

    const numbered = ['상도1동', '상도2동', '상도3동', '상도4동'].map((n) => searchRegions(n)[0]);
    const lats = numbered.map((p) => p.at.lat);
    const lngs = numbered.map((p) => p.at.lng);
    expect(sangdo.at.lat).toBeGreaterThanOrEqual(Math.min(...lats));
    expect(sangdo.at.lat).toBeLessThanOrEqual(Math.max(...lats));
    expect(sangdo.at.lng).toBeGreaterThanOrEqual(Math.min(...lngs));
    expect(sangdo.at.lng).toBeLessThanOrEqual(Math.max(...lngs));

    // "성수1가1동" 같은 '가' 번호도 "성수동"으로 접힌다.
    expect(searchRegions('성수동')[0].address).toBe('서울특별시 성동구');
  });

  it('일반시 밑의 구는 구 이름으로 찾아지고 주소에 시가 붙는다', () => {
    // 원료는 "성남시분당구"라고 적는다. 사람은 "분당구"를 친다.
    const [bundang] = searchRegions('분당구');
    expect(bundang.name).toBe('분당구');
    expect(bundang.address).toBe('경기도 성남시');

    // 그 안의 동은 시와 구가 다 붙는다.
    const [pangyo] = searchRegions('판교동');
    expect(pangyo.address).toBe('경기도 성남시 분당구');

    // 시 자체도 찾아진다.
    const [seongnam] = searchRegions('성남시');
    expect(seongnam.name).toBe('성남시');
    expect(seongnam.address).toBe('경기도');
  });

  it('진짜 행정동이 있는 이름은 파생하지 않는다 — 흑석동은 하나뿐이다', () => {
    const found = searchRegions('흑석동').filter(
      (p) => p.name === '흑석동' && p.address === '서울특별시 동작구'
    );

    expect(found).toHaveLength(1);
  });

  it('동을 안 붙여도 찾아진다 — "흑석"만 쳐도', () => {
    const found = searchRegions('흑석');

    expect(found.map((p) => p.name)).toContain('흑석동');
  });

  it('정확히 맞는 이름이 부분 일치보다 앞이다', () => {
    // "동작"은 동작구가 답이지, 이름에 '동작'이 들어간 어느 동이 아니다.
    const [top] = searchRegions('동작');

    expect(top.name).toBe('동작구');
  });

  it('같은 이름이 여럿이면 상위 구역으로 갈라 보인다', () => {
    // 중구는 서울·부산·대구·인천·대전·울산에 다 있다.
    const found = searchRegions('중구');
    const addresses = new Set(found.map((p) => p.address));

    expect(found.length).toBeGreaterThan(1);
    expect(addresses.size).toBe(found.length);
    for (const place of found) {
      expect(place.address).not.toBe('');
    }
  });

  it('현재 위치를 알면 그 근처 것이 먼저다', () => {
    const busan = { lat: 35.1, lng: 129.03 };
    const [top] = searchRegions('중구', busan);

    expect(top.address).toContain('부산');
  });

  it('공백과 대소문자를 가리지 않는다', () => {
    expect(searchRegions('흑 석 동')[0]?.name).toBe('흑석동');
    expect(searchRegions('  흑석동  ')[0]?.name).toBe('흑석동');
  });

  it('없는 곳은 빈 목록 — 지어내지 않는다', () => {
    expect(searchRegions('존재하지않는동네xyz')).toEqual([]);
    expect(searchRegions('')).toEqual([]);
  });

  it('한 번에 여덟 곳까지만', () => {
    expect(searchRegions('동').length).toBeLessThanOrEqual(8);
  });
});

describe('색인 자체 — 누군가 잘라 내지 않았는지', () => {
  it('전국을 담고 있다', () => {
    // 시도 17 + 시군구 251 + 읍면동 3,482. 이 아래로 떨어지면 어딘가가 빠진 것이다.
    expect(KOREA_REGIONS.length).toBeGreaterThan(3700);
  });

  it('모든 줄이 좌표를 갖고 한국 안에 있다', () => {
    for (const [code, name, lat, lng] of KOREA_REGIONS) {
      // 2자리 시도, 5자리 시군구, 7자리 읍면동, 파생 법정동(시군구+'D'+한 자),
      // 구를 거느린 시(시도+'C'+한 자).
      expect(code, name).toMatch(/^(\d{2}|\d{5}|\d{7}|\d{5}D[0-9A-Z]|\d{2}C[0-9A-Z])$/);
      expect(lat, name).toBeGreaterThan(33);
      expect(lat, name).toBeLessThan(39);
      expect(lng, name).toBeGreaterThan(124);
      expect(lng, name).toBeLessThan(132);
    }
  });

  it('파생한 이름에는 숫자도 중간점도 없다 — 가짜 동을 만들지 않는다', () => {
    /*
     * 파생 규칙이 '\d+동'만 보던 시절, '면목3·8동'에서 뒤의 '8동'만 떨어져
     * '면목3·동'이라는 **없는 동** 13개가 색인에 실렸다. 사용자가 '상계'를 치면
     * 진짜 동들 사이에 '상계6·동'이 나란히 떴을 것이다. 지어내지 않는다는 것이
     * 이 색인의 존재 이유인데, 만들다가 지어내면 안 된다.
     */
    for (const [code, name] of KOREA_REGIONS) {
      if (code.includes('D')) {
        expect(name, code).not.toMatch(/[0-9·]/);
      }
    }
  });

  it('중간점 이름이 제대로 접힌다 — 면목3·8동에서 면목동이 나온다', () => {
    expect(searchRegions('면목동')[0]?.name).toBe('면목동');
    expect(searchRegions('상계동')[0]?.name).toBe('상계동');
  });

  it('읍면동마다 시군구와 시도가 있다', () => {
    const codes = new Set(KOREA_REGIONS.map(([code]) => code));
    for (const [code, name] of KOREA_REGIONS) {
      if (code.length === 7) {
        expect(codes.has(code.slice(0, 5)), `${name}의 시군구`).toBe(true);
        expect(codes.has(code.slice(0, 2)), `${name}의 시도`).toBe(true);
      }
    }
  });
});

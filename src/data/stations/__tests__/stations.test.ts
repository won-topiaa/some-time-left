import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KOREA_STATIONS } from '../korea';
import { searchStations } from '../search';
import { findPlaces } from '../../places';
import { configureApi } from '../../../config';

/**
 * 사용자가 겪은 그대로: "봉천역"을 쳤는데 안 나왔다.
 *
 * 번들 안에 역이 하나도 없었기 때문이다. 행정구역 색인에는 역이 없고, 서울
 * 핫스팟 121곳 중 이름에 '역'이 든 46곳은 혼잡도 지점이 우연히 역 이름인 것이라
 * 서울 지하철의 6분의 1도 안 됐다. 서울 밖은 한 곳도 없었다.
 *
 * 이 파일이 통과하는 한 역 이름은 네트워크와 무관하게 찾아진다.
 */
describe('searchStations — 오프라인 바닥: 전국 역', () => {
  it('사용자가 못 찾았던 그 입력', () => {
    const [top] = searchStations('봉천역');

    expect(top).toBeDefined();
    expect(top.name).toBe('봉천역');
    expect(Number.isFinite(top.at.lat)).toBe(true);
    expect(Number.isFinite(top.at.lng)).toBe(true);
  });

  /*
   * OSM은 역 이름에 '역'을 안 붙인다 — 받아 온 1,323곳 중 7곳만 붙어 있었다.
   * 그래서 색인을 만들 때 붙여 뒀다. 안 붙였으면 색인을 넣고도 못 찾는다.
   */
  it('색인의 이름은 모두 역으로 끝난다', () => {
    const wrong = KOREA_STATIONS.filter((row) => !row[0].endsWith('역'));
    expect(wrong.map((row) => row[0])).toEqual([]);
  });

  it("'역'을 붙이든 안 붙이든 찾아진다", () => {
    for (const query of ['봉천', '봉천역', '사당', '사당역']) {
      const found = searchStations(query);
      expect(found.length, query).toBeGreaterThan(0);
    }
  });

  /*
   * 이름 가운데에 든 역도 찾아져야 한다.
   *
   * OSM에는 4호선 '총신대입구(이수)'와 7호선 '이수'가 따로 있다. 색인이 되면
   * "총신대입구(이수)역"과 "이수역"이 되는데, "이수역"을 치면 뒤엣것만 걸린다 —
   * 앞엣것의 '역'이 맨 뒤에 있어서 "이수역"이라는 글자가 이름 안에 없기 때문이다.
   * 그래서 양쪽의 '역'을 떼고 한 번 더 본다("이수" ⊂ "총신대입구(이수)").
   * 환승하는 같은 자리인데 하나만 보여 주면 고르는 사람이 헷갈린다.
   */
  it('이름 가운데에 든 역도 찾아진다', () => {
    const found = searchStations('이수역').map((place) => place.name);

    expect(found).toContain('이수역');
    expect(found).toContain('총신대입구(이수)역');
  });

  it('서울 밖도 있다 — 이게 없어서 시작된 일이다', () => {
    const cases: Array<[string, string]> = [
      ['서면역', '부산'],
      ['반월당역', '대구'],
      ['정부청사역', '대전'],
      ['금남로4가역', '광주'],
      ['부평역', '인천'],
      ['수원역', '경기'],
      ['춘천역', '강원'],
    ];
    for (const [query, where] of cases) {
      const [top] = searchStations(query);
      expect(top, `${where} ${query}`).toBeDefined();
      expect(top.name).toBe(query);
    }
  });

  it('도시철도와 일반철도가 다 들어 있다', () => {
    // 춘천역은 일반철도(경춘선), 봉천역은 도시철도. 둘 다 약속 장소가 된다.
    expect(searchStations('춘천역')).not.toHaveLength(0);
    expect(searchStations('봉천역')).not.toHaveLength(0);
  });

  it('위치를 알면 가까운 쪽이 앞이다', () => {
    /*
     * 같은 이름의 역이 전국에 여럿이다. 시청역은 서울에도 부산에도 있어서
     * 이름으로는 가릴 수 없다 — 좌표로 봐야 한다. 그래서 목적지 화면이
     * 현재 위치를 넘긴다.
     */
    const busan = { lat: 35.1796, lng: 129.0756 };
    const seoul = { lat: 37.5665, lng: 126.978 };
    const [nearBusan] = searchStations('시청역', busan);
    const [nearSeoul] = searchStations('시청역', seoul);

    expect(nearBusan.name).toBe('시청역');
    expect(nearSeoul.name).toBe('시청역');
    // 부산 시청역은 위도 35도대, 서울 시청역은 37도대.
    expect(nearBusan.at.lat).toBeLessThan(36);
    expect(nearSeoul.at.lat).toBeGreaterThan(37);
  });

  it('동명이역을 하나로 뭉개지 않는다', () => {
    const cityHalls = KOREA_STATIONS.filter((row) => row[0] === '시청역');
    // 뭉개면 부산에 서서 '시청역'을 쳤을 때 서울로 보내게 된다.
    expect(cityHalls.length).toBeGreaterThan(1);
  });

  it('북한 역은 없다', () => {
    // 받아 온 데이터에 '조선민주주의인민공화국 철도성' 54곳이 섞여 있었다.
    // 걸어서 갈 수 있는 목적지가 아니다.
    const above = KOREA_STATIONS.filter((row) => row[1] > 38.62);
    expect(above.map((row) => row[0])).toEqual([]);
  });

  it('좌표가 전부 남한 안이다', () => {
    for (const row of KOREA_STATIONS) {
      expect(row[1], row[0]).toBeGreaterThan(33.0);
      expect(row[1], row[0]).toBeLessThan(38.62);
      expect(row[2], row[0]).toBeGreaterThan(125.0);
      expect(row[2], row[0]).toBeLessThan(129.65);
    }
  });
});

describe('findPlaces — 역이 오프라인 바닥에 든다', () => {
  const realFetch = globalThis.fetch;

  it('네트워크가 죽어도 봉천역이 찾아진다', async () => {
    globalThis.fetch = (() => Promise.reject(new Error('offline'))) as typeof fetch;
    configureApi({ tmap: { appKey: null } });
    try {
      const found = await findPlaces('봉천역');
      expect(found.map((place) => place.name)).toContain('봉천역');
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

/**
 * 점검에서 나온 것들. 하나같이 **통과하는 테스트를 이미 갖고 있던** 결함이라,
 * 여기 적는 것은 그 테스트들이 왜 무력했는지이기도 하다.
 */
describe('searchStations — 점검에서 드러난 것들', () => {
  /**
   * 남한의 북쪽 경계. 생성기의 `NORTH_EDGE`와 같은 값이어야 한다.
   *
   * 예전 가드는 `lat > 38.62`만 봤다. 그런데 생성기가 그 값을 이미 버리므로
   * 그런 줄은 원리상 존재할 수 없었고, 북한 역 35곳이 든 상태로도 통과했다.
   * 휴전선은 서쪽에서 아래로 처져 있다 — 개성역(37.969)은 도라산역(37.898)보다
   * 북쪽이지만, 부포역(37.826)은 도라산역보다 **남쪽**이다. 한 줄로는 못 가른다.
   */
  const NORTH_EDGE: Array<[number, number]> = [
    [126.7, 37.8],
    [128.0, 38.35],
    [129.65, 38.62],
  ];

  function insideSouthKorea(lat: number, lng: number): boolean {
    for (const [lngLimit, latLimit] of NORTH_EDGE) {
      if (lng < lngLimit) {
        return lat <= latLimit;
      }
    }
    return false;
  }

  it('북한 역이 없다 — 좌표로 본다', () => {
    const outside = KOREA_STATIONS.filter((row) => !insideSouthKorea(row[1], row[2]));
    expect(outside.map((row) => `${row[0]} ${row[1]},${row[2]}`)).toEqual([]);
  });

  it('한때 들어와 있던 이름들이 없다', () => {
    // 33곳이 들어와 있었다. "개성"을 치면 개성역이 유일한 결과였다.
    const gone = ['개성역', '판문역', '옹진역', '장연역', '서해주역', '강령역', '부포역'];
    const names = new Set(KOREA_STATIONS.map((row) => row[0]));
    expect(gone.filter((name) => names.has(name))).toEqual([]);
  });

  it('그 이름을 이름만으로 자르지는 않는다', () => {
    /*
     * 북한에도 문정역·신천역이 있었다. 그렇다고 이름으로 걸러내면 서울 송파
     * 문정역, 대구·시흥 신천역이 같이 사라진다 — 그래서 좌표로 자른다.
     */
    const munjeong = KOREA_STATIONS.filter((row) => row[0] === '문정역');
    const sincheon = KOREA_STATIONS.filter((row) => row[0] === '신천역');

    expect(munjeong).toHaveLength(1);
    expect(munjeong[0][1]).toBeCloseTo(37.486, 2); // 서울 송파
    expect(sincheon).toHaveLength(2); // 대구, 시흥
  });

  it('경의선 최북단 역들은 남아 있다', () => {
    // 자르는 선이 조금만 낮았으면 이들이 같이 사라진다. 실제 영업역이다.
    const names = new Set(KOREA_STATIONS.map((row) => row[0]));
    for (const name of ['도라산역', '임진강역', '문산역', '백마고지역', '제진역']) {
      expect(names.has(name), name).toBe(true);
    }
  });

  /*
   * 1200m가 2호선 신촌역을 지웠다. 색인에 남은 신촌역은 경의중앙선 하나였고,
   * 2호선 출구에 서서 "신촌역"을 치면 704m 떨어진 다른 역이 유일한 결과였다 —
   * 이 앱의 보행 속도로 9분이 넘는다. 3분을 만들려는 앱이 그 세 배를 틀린다.
   */
  it('신촌역은 두 곳이다 — 2호선과 경의중앙선', () => {
    const sinchon = searchStations('신촌역');
    expect(sinchon).toHaveLength(2);

    // 부제가 같으면 화면에 똑같은 두 줄이 뜬다. 둘 다 network는 '수도권 전철'이라
    // 그때만 운영 주체(서울교통공사 / 한국철도공사)로 내려간다.
    const subtitles = sinchon.map((place) => place.address);
    expect(new Set(subtitles).size).toBe(2);
  });

  it('한 역이 두 줄로 갈라지지는 않는다', () => {
    // 문턱을 300m까지 내리면 노원·청량리·홍대입구가 갈라진다.
    for (const name of ['노원역', '청량리역', '홍대입구역', '서울역']) {
      expect(searchStations(name).filter((place) => place.name === name), name).toHaveLength(1);
    }
  });

  it('폐역은 없고, 이름에 역이 두 번 붙지 않는다', () => {
    /*
     * ')'로 끝나는 것 자체는 잘못이 아니다 — 김천(구미)역·총신대입구(이수)역은
     * 실제 정식 명칭이다. 잘못은 **겹쳐 붙은** 쪽이다: "간치역 (폐역)"의 마지막
     * 글자만 보고 '역'을 또 붙여 "간치역 (폐역)역"이 됐다. 아무도 그렇게 부르지
     * 않는 이름이 "간치역"의 유일한 결과로 떴다.
     */
    const names = KOREA_STATIONS.map((row) => row[0]);

    expect(names.filter((name) => name.includes('폐역'))).toEqual([]);
    expect(names.filter((name) => name.endsWith('역역'))).toEqual([]);
    expect(names.filter((name) => /역\s*\([^)]*\)역$/.test(name))).toEqual([]);
  });
});

/**
 * 생성기가 지키는 약속 — 손으로 돌리는 스크립트라 동작 테스트가 어렵다.
 * 약속 자체를 소스에 못으로 박는다.
 */
describe('build-station-index.mjs', () => {
  const source = readFileSync(
    join(__dirname, '..', '..', '..', '..', 'scripts', 'build-station-index.mjs'),
    'utf8'
  );

  /**
   * 주석을 뺀 코드.
   *
   * 왜 그렇게 하지 않았는지 적어 둔 설명에 그 낱말이 들어 있으면 못이 설명을
   * 물어 버린다. 그러면 고치는 손이 코드가 아니라 설명을 지우는 쪽으로 간다.
   */
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');

  it('200에 remark만 온 응답을 성공으로 치지 않는다', () => {
    /*
     * Overpass는 시간 초과를 HTTP 200에 `remark`만 담아 보내기도 한다.
     * `elements ?? []`로 받으면 빈 배열이 성공으로 통과하고, 그 구역이 통째로
     * 빠진 색인을 조용히 쓴다 — 머리 주석이 "멈춘다"고 약속한 바로 그 실패다.
     */
    expect(source).toContain('parsed.remark == null');
    expect(source).toContain('parsed.elements.length > 0');
  });

  it('남한 판정을 경도 구간별 계단으로 한다', () => {
    // 한 상자로 자르면 개성·황해도가 통과한다. 태그에 기대도 마찬가지다.
    expect(source).toContain('NORTH_EDGE');
    expect(source).toMatch(/\[126\.7, 37\.8\]/);
  });

  /*
   * 이름 붙이기는 **지금 데이터로는 관찰되지 않는다.** 문제를 드러냈던 유일한
   * 입력("간치역 (폐역)")이 폐역 필터에서 먼저 잘려 나가기 때문이다. 그래도
   * 남겨 둔다 — 영업역에 "OO역 (임시)" 같은 표기가 붙는 날 다시 생긴다.
   * 데이터로 잡을 수 없으니 규칙 자체를 못으로 박는다.
   */
  it('괄호를 떼고 본체가 역으로 끝나는지 본다', () => {
    expect(source).toContain('const body = name.replace(');
    expect(source).toContain("body.endsWith('역')");
  });

  it("includes('역')으로 판정하지 않는다", () => {
    /*
     * 그렇게 하면 역삼·역곡·역촌·동대문역사문화공원·암사역사공원이 접미사를
     * 잃어서 "역삼역"으로 못 찾게 된다. 전부 실재하는 역이다.
     */
    expect(code).not.toContain("includes('역')");
  });

  it('고정된 실측 숫자를 주석에 박아 두지 않는다', () => {
    // 재생성하면 조용히 거짓이 된다. 돌릴 때 찍는다.
    expect(source).not.toMatch(/1,?323곳 중 7곳/);
    expect(source).not.toMatch(/수도권 전철 402/);
  });
});

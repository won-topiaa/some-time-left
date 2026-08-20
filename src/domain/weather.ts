/**
 * 날씨.
 *
 * 이 앱에서 날씨는 정보가 아니라 **편지의 첫 줄**이다. 첫 화면 맨 위에 한 줄로만
 * 두고, 예보표도 아이콘도 두지 않는다 — 지금 나가서 걸을지를 정하는 데 필요한 건
 * 몇 도인지와 비가 오는지 둘뿐이다.
 *
 * 기상청 초단기예보(`getUltraSrtFcst`)를 쓴다. 실황(`Ncst`)에는 하늘 상태(SKY)가
 * 없어서, 맑은지 흐린지를 말할 수 없다. 그늘을 권하는 앱이 그걸 모르면 곤란하다.
 */

/** 격자 변환·발표 시각 계산은 한국 표준시 기준. 한국은 서머타임이 없다. */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export interface Grid {
  nx: number;
  ny: number;
}

/*
 * 기상청 격자(DFS) 변환 상수.
 * 람베르트 정각 원뿔 도법이고, 이 값들은 기상청이 배포하는 예제 코드와 같다.
 * 서울(60,127)·부산(98,76)·제주(53,38)로 검산했다.
 */
const RE = 6371.00877; // 지구 반경 (km)
const GRID = 5.0; // 격자 간격 (km)
const SLAT1 = 30.0; // 투영 위도 1 (deg)
const SLAT2 = 60.0; // 투영 위도 2 (deg)
const OLON = 126.0; // 기준점 경도 (deg)
const OLAT = 38.0; // 기준점 위도 (deg)
const XO = 43; // 기준점 X 좌표
const YO = 136; // 기준점 Y 좌표

const DEG = Math.PI / 180;

/** 위경도 → 기상청 격자. 5km 격자라 목적지든 현재 위치든 대개 같은 칸에 떨어진다. */
export function toGrid(lat: number, lng: number): Grid {
  const re = RE / GRID;
  const slat1 = SLAT1 * DEG;
  const slat2 = SLAT2 * DEG;
  const olon = OLON * DEG;
  const olat = OLAT * DEG;

  let sn =
    Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);

  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (sf ** sn * Math.cos(slat1)) / sn;

  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / ro ** sn;

  let ra = Math.tan(Math.PI * 0.25 + lat * DEG * 0.5);
  ra = (re * sf) / ra ** sn;

  let theta = lng * DEG - olon;
  if (theta > Math.PI) {
    theta -= 2 * Math.PI;
  }
  if (theta < -Math.PI) {
    theta += 2 * Math.PI;
  }
  theta *= sn;

  return {
    nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5),
  };
}

export interface BaseTime {
  /** YYYYMMDD */
  baseDate: string;
  /** HHMM */
  baseTime: string;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * 초단기예보의 발표 시각.
 *
 * 매시 30분에 발표되고 45분쯤부터 받아진다. 45분 전에는 직전 시간 것을 불러야
 * 빈 응답을 받지 않는다 — 6시 40분에 0630을 물으면 아직 없다고 나온다.
 */
export function baseTimeFor(nowMs: number): BaseTime {
  const shifted = new Date(nowMs + KST_OFFSET_MS);
  const back = shifted.getUTCMinutes() >= 45 ? 0 : 60 * 60 * 1000;
  const at = new Date(nowMs + KST_OFFSET_MS - back);

  return {
    baseDate: `${at.getUTCFullYear()}${pad2(at.getUTCMonth() + 1)}${pad2(at.getUTCDate())}`,
    baseTime: `${pad2(at.getUTCHours())}30`,
  };
}

export type Sky = 'clear' | 'partly' | 'cloudy';
export type Precip = 'none' | 'rain' | 'sleet' | 'snow' | 'shower';

export interface Weather {
  /** 섭씨 */
  tempC: number;
  sky: Sky;
  precip: Precip;
}

/** 예보 항목 하나. 기상청 응답의 필드 이름 그대로. */
export interface ForecastItem {
  category: string;
  fcstDate: string;
  fcstTime: string;
  fcstValue: string;
}

const SKY_BY_CODE: Record<string, Sky> = { '1': 'clear', '3': 'partly', '4': 'cloudy' };

const PRECIP_BY_CODE: Record<string, Precip> = {
  '0': 'none',
  '1': 'rain',
  '2': 'sleet',
  '3': 'snow',
  // 4(소나기)는 초단기예보 코드표에 없지만 단기예보에는 있다. 언젠가 그쪽으로
  // 옮기게 되면 조용히 '없음'으로 떨어지는 것보다 읽히는 편이 낫다.
  '4': 'shower',
  // 5 빗방울, 6 빗방울눈날림, 7 눈날림 — 사람이 느끼기엔 비/진눈깨비/눈과 같다.
  '5': 'rain',
  '6': 'sleet',
  '7': 'snow',
};

/**
 * 예보 목록에서 **가장 이른 시각**의 날씨를 뽑는다.
 *
 * 응답은 여섯 시간치가 한꺼번에 오는데, 지금 나갈지 정하는 데 필요한 건 첫 칸뿐이다.
 * 세 값(T1H·SKY·PTY) 중 하나라도 없으면 null — 반쪽짜리 문장을 만들지 않는다.
 */
export function firstForecast(items: ForecastItem[]): Weather | null {
  if (items.length === 0) {
    return null;
  }

  const keyOf = (i: ForecastItem) => `${i.fcstDate}${i.fcstTime}`;
  const earliest = items.reduce((min, i) => (keyOf(i) < min ? keyOf(i) : min), keyOf(items[0]));

  const at = items.filter((i) => keyOf(i) === earliest);
  const value = (category: string) => at.find((i) => i.category === category)?.fcstValue;

  const temp = value('T1H');
  const sky = SKY_BY_CODE[value('SKY') ?? ''];
  const precip = PRECIP_BY_CODE[value('PTY') ?? ''];

  if (temp == null || sky == null || precip == null) {
    return null;
  }

  const tempC = Number(temp);
  if (!Number.isFinite(tempC)) {
    return null;
  }

  return { tempC: Math.round(tempC), sky, precip };
}

const SKY_WORD: Record<Sky, string> = {
  clear: '맑아요',
  partly: '구름이 조금 있어요',
  cloudy: '흐려요',
};

const PRECIP_WORD: Record<Exclude<Precip, 'none'>, string> = {
  rain: '비가 와요',
  sleet: '진눈깨비가 와요',
  snow: '눈이 와요',
  shower: '소나기가 지나가요',
};

/**
 * 첫 화면 맨 위 한 줄.
 *
 * 비가 오면 하늘 상태는 말하지 않는다 — 비 오는 날 흐린 건 새 소식이 아니다.
 */
export function weatherLine(weather: Weather): string {
  const rest =
    weather.precip === 'none' ? SKY_WORD[weather.sky] : PRECIP_WORD[weather.precip];
  return `지금 ${weather.tempC}도, ${rest}`;
}

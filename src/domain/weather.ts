/**
 * 날씨.
 *
 * 이 앱에서 날씨는 정보가 아니라 **편지의 첫 줄**이다. 첫 화면 맨 위에 한 줄로만
 * 두고, 예보표도 아이콘도 두지 않는다 — 지금 나가서 걸을지를 정하는 데 필요한 건
 * 몇 도인지와 하늘이 어떤지 둘뿐이다.
 *
 * 기상청 초단기예보를 쓰다가 Open-Meteo로 옮겼다. 기상청은 서비스마다 활용신청을
 * 따로 받아서, 공원이 승인돼도 날씨는 다시 신청하고 승인을 기다려야 한다.
 * 한 줄짜리 기능이 그만한 절차를 요구하면 그건 기능이 비싼 것이다.
 * Open-Meteo는 키가 아예 없고 좌표를 그대로 받는다(격자 변환도 필요 없다).
 */

export type Sky = 'clear' | 'partly' | 'cloudy';
export type Precip = 'none' | 'rain' | 'sleet' | 'snow' | 'shower' | 'thunder';

export interface Weather {
  /** 섭씨 */
  tempC: number;
  sky: Sky;
  precip: Precip;
}

/**
 * WMO 날씨 코드 → 우리가 쓰는 두 값.
 *
 * 표에 없는 코드는 **모르는 것으로 둔다.** 억지로 '맑음'에 밀어 넣으면
 * 비 오는 날 맑다고 말하게 된다 — 이 앱이 하지 않기로 한 일이다.
 */
const BY_CODE: Record<number, { sky: Sky; precip: Precip }> = {
  0: { sky: 'clear', precip: 'none' }, // 맑음
  1: { sky: 'clear', precip: 'none' }, // 대체로 맑음
  2: { sky: 'partly', precip: 'none' }, // 구름 조금
  3: { sky: 'cloudy', precip: 'none' }, // 흐림
  45: { sky: 'cloudy', precip: 'none' }, // 안개
  48: { sky: 'cloudy', precip: 'none' }, // 서리 안개

  51: { sky: 'cloudy', precip: 'rain' }, // 이슬비 약
  53: { sky: 'cloudy', precip: 'rain' }, // 이슬비 중
  55: { sky: 'cloudy', precip: 'rain' }, // 이슬비 강
  61: { sky: 'cloudy', precip: 'rain' }, // 비 약
  63: { sky: 'cloudy', precip: 'rain' }, // 비 중
  65: { sky: 'cloudy', precip: 'rain' }, // 비 강

  56: { sky: 'cloudy', precip: 'sleet' }, // 어는 이슬비 약
  57: { sky: 'cloudy', precip: 'sleet' }, // 어는 이슬비 강
  66: { sky: 'cloudy', precip: 'sleet' }, // 어는 비 약
  67: { sky: 'cloudy', precip: 'sleet' }, // 어는 비 강

  71: { sky: 'cloudy', precip: 'snow' }, // 눈 약
  73: { sky: 'cloudy', precip: 'snow' }, // 눈 중
  75: { sky: 'cloudy', precip: 'snow' }, // 눈 강
  77: { sky: 'cloudy', precip: 'snow' }, // 싸락눈
  85: { sky: 'cloudy', precip: 'snow' }, // 소낙눈 약
  86: { sky: 'cloudy', precip: 'snow' }, // 소낙눈 강

  80: { sky: 'cloudy', precip: 'shower' }, // 소나기 약
  81: { sky: 'cloudy', precip: 'shower' }, // 소나기 중
  82: { sky: 'cloudy', precip: 'shower' }, // 소나기 강

  95: { sky: 'cloudy', precip: 'thunder' }, // 뇌우
  96: { sky: 'cloudy', precip: 'thunder' }, // 뇌우 + 약한 우박
  99: { sky: 'cloudy', precip: 'thunder' }, // 뇌우 + 강한 우박
};

/**
 * 응답의 `current` 한 덩어리를 읽는다.
 *
 * 기온과 코드 중 하나라도 없거나 모르는 값이면 null — 반쪽짜리 문장을 만들지 않는다.
 * 화면은 그때 그 줄을 아예 그리지 않는다.
 */
export function readCurrent(current: unknown): Weather | null {
  if (current == null || typeof current !== 'object') {
    return null;
  }

  const { temperature_2m: temp, weather_code: code } = current as Record<string, unknown>;

  if (typeof temp !== 'number' || !Number.isFinite(temp)) {
    return null;
  }
  if (typeof code !== 'number') {
    return null;
  }

  const known = BY_CODE[code];
  if (known == null) {
    return null;
  }

  return { tempC: Math.round(temp), sky: known.sky, precip: known.precip };
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
  thunder: '천둥번개가 쳐요',
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

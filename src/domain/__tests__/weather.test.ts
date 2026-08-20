import { describe, expect, it } from 'vitest';
import { baseTimeFor, firstForecast, toGrid, weatherLine, type ForecastItem } from '../weather';

/** 한국 시간으로 만든 epoch ms. 실행 환경 시간대에 흔들리지 않게. */
function kst(y: number, mo: number, d: number, h: number, mi: number): number {
  return Date.UTC(y, mo - 1, d, h - 9, mi, 0, 0);
}

describe('toGrid — 위경도를 기상청 격자로', () => {
  /**
   * 기상청이 배포하는 격자 목록의 값들. 세 곳이 다 맞으면 투영이 맞다 —
   * 하나만 맞추기는 상수를 잘못 넣어도 우연히 되는 일이 있다.
   */
  it.each([
    ['서울 종로구', 37.5665, 126.978, 60, 127],
    ['부산 중구', 35.1796, 129.0756, 98, 76],
    ['제주시', 33.4996, 126.5312, 53, 38],
  ])('%s', (_name, lat, lng, nx, ny) => {
    expect(toGrid(lat, lng)).toEqual({ nx, ny });
  });

  it('가까운 두 곳은 같은 칸에 떨어진다', () => {
    // 5km 격자라, 걸어갈 만한 거리의 출발지와 목적지는 대개 같은 날씨다.
    expect(toGrid(37.5445, 127.0435)).toEqual(toGrid(37.5472, 127.0446));
  });
});

describe('baseTimeFor — 발표 시각', () => {
  it('45분이 지나야 그 시간 발표를 부른다', () => {
    expect(baseTimeFor(kst(2026, 8, 20, 6, 45))).toEqual({
      baseDate: '20260820',
      baseTime: '0630',
    });
  });

  it('45분 전에는 직전 시간을 부른다', () => {
    // 6시 40분에 0630을 물으면 아직 없다고 나온다.
    expect(baseTimeFor(kst(2026, 8, 20, 6, 40))).toEqual({
      baseDate: '20260820',
      baseTime: '0530',
    });
  });

  it('자정 직후에는 전날로 넘어간다', () => {
    expect(baseTimeFor(kst(2026, 8, 20, 0, 10))).toEqual({
      baseDate: '20260819',
      baseTime: '2330',
    });
  });

  it('한국 시간으로 센다', () => {
    // UTC로는 아직 8월 19일이지만 한국은 이미 20일 아침이다.
    expect(baseTimeFor(kst(2026, 8, 20, 8, 50)).baseDate).toBe('20260820');
  });
});

const item = (category: string, fcstValue: string, fcstTime = '0700'): ForecastItem => ({
  category,
  fcstDate: '20260820',
  fcstTime,
  fcstValue,
});

describe('firstForecast — 가장 이른 시각만', () => {
  it('세 값을 모두 읽는다', () => {
    expect(
      firstForecast([item('T1H', '28'), item('SKY', '1'), item('PTY', '0')])
    ).toEqual({ tempC: 28, sky: 'clear', precip: 'none' });
  });

  it('뒤 시간대는 무시한다', () => {
    const weather = firstForecast([
      item('T1H', '31', '0900'),
      item('SKY', '4', '0900'),
      item('PTY', '1', '0900'),
      item('T1H', '28', '0700'),
      item('SKY', '1', '0700'),
      item('PTY', '0', '0700'),
    ]);
    expect(weather).toEqual({ tempC: 28, sky: 'clear', precip: 'none' });
  });

  it('날짜가 넘어가도 이른 쪽을 고른다', () => {
    const late = { ...item('T1H', '5', '0000'), fcstDate: '20260821' };
    const weather = firstForecast([
      late,
      { ...item('SKY', '4', '0000'), fcstDate: '20260821' },
      { ...item('PTY', '0', '0000'), fcstDate: '20260821' },
      item('T1H', '28', '2300'),
      item('SKY', '1', '2300'),
      item('PTY', '0', '2300'),
    ]);
    expect(weather?.tempC).toBe(28);
  });

  it('하나라도 없으면 null — 반쪽짜리 문장을 만들지 않는다', () => {
    expect(firstForecast([item('T1H', '28'), item('SKY', '1')])).toBeNull();
    expect(firstForecast([item('SKY', '1'), item('PTY', '0')])).toBeNull();
    expect(firstForecast([])).toBeNull();
  });

  it('모르는 코드는 null', () => {
    expect(firstForecast([item('T1H', '28'), item('SKY', '9'), item('PTY', '0')])).toBeNull();
  });

  it('숫자가 아닌 기온은 null', () => {
    expect(firstForecast([item('T1H', '-'), item('SKY', '1'), item('PTY', '0')])).toBeNull();
  });

  it('영하와 소수점을 읽는다', () => {
    expect(
      firstForecast([item('T1H', '-3.4'), item('SKY', '4'), item('PTY', '3')])
    ).toEqual({ tempC: -3, sky: 'cloudy', precip: 'snow' });
  });
});

describe('weatherLine — 맨 위 한 줄', () => {
  it('맑으면 하늘을 말한다', () => {
    expect(weatherLine({ tempC: 28, sky: 'clear', precip: 'none' })).toBe('지금 28도, 맑아요');
  });

  it('비가 오면 하늘 상태는 말하지 않는다', () => {
    // 비 오는 날 흐린 건 새 소식이 아니다.
    expect(weatherLine({ tempC: 21, sky: 'cloudy', precip: 'rain' })).toBe('지금 21도, 비가 와요');
  });

  it('영하도 그대로', () => {
    expect(weatherLine({ tempC: -3, sky: 'cloudy', precip: 'snow' })).toBe('지금 -3도, 눈이 와요');
  });
});

import { describe, expect, it } from 'vitest';
import { readCurrent, weatherLine } from '../weather';

const current = (temperature_2m: unknown, weather_code: unknown) => ({
  time: '2026-08-20T17:45',
  temperature_2m,
  weather_code,
});

describe('readCurrent — Open-Meteo 응답 읽기', () => {
  it('맑음', () => {
    expect(readCurrent(current(28.2, 0))).toEqual({
      tempC: 28,
      sky: 'clear',
      precip: 'none',
    });
  });

  it('실제로 받은 응답 그대로', () => {
    // 2026-08-20 17:45 서울. 이 값으로 붙였다.
    expect(readCurrent(current(24.8, 61))).toEqual({
      tempC: 25,
      sky: 'cloudy',
      precip: 'rain',
    });
  });

  it.each([
    ['맑음', 0, 'clear', 'none'],
    ['대체로 맑음', 1, 'clear', 'none'],
    ['구름 조금', 2, 'partly', 'none'],
    ['흐림', 3, 'cloudy', 'none'],
    ['안개', 45, 'cloudy', 'none'],
    ['이슬비', 51, 'cloudy', 'rain'],
    ['어는 비', 66, 'cloudy', 'sleet'],
    ['눈', 73, 'cloudy', 'snow'],
    ['소낙눈', 85, 'cloudy', 'snow'],
    ['소나기', 81, 'cloudy', 'shower'],
    ['뇌우', 95, 'cloudy', 'thunder'],
    ['뇌우 + 우박', 99, 'cloudy', 'thunder'],
  ])('%s (코드 %i)', (_name, code, sky, precip) => {
    expect(readCurrent(current(20, code))).toEqual({ tempC: 20, sky, precip });
  });

  it('영하도 반올림해서 읽는다', () => {
    expect(readCurrent(current(-3.4, 71))?.tempC).toBe(-3);
    expect(readCurrent(current(-3.6, 71))?.tempC).toBe(-4);
  });

  it('모르는 코드는 null — 억지로 맑음에 밀어 넣지 않는다', () => {
    expect(readCurrent(current(20, 7))).toBeNull();
    expect(readCurrent(current(20, 100))).toBeNull();
    expect(readCurrent(current(20, -1))).toBeNull();
  });

  it('값이 없거나 이상하면 null', () => {
    expect(readCurrent(current(undefined, 0))).toBeNull();
    expect(readCurrent(current(20, undefined))).toBeNull();
    expect(readCurrent(current('24.8', 0))).toBeNull();
    expect(readCurrent(current(20, '0'))).toBeNull();
    expect(readCurrent(current(NaN, 0))).toBeNull();
    expect(readCurrent(null)).toBeNull();
    expect(readCurrent(undefined)).toBeNull();
    expect(readCurrent('맑음')).toBeNull();
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

  it('천둥번개는 걸을지 말지를 바꾸므로 따로 말한다', () => {
    expect(weatherLine({ tempC: 26, sky: 'cloudy', precip: 'thunder' })).toBe(
      '지금 26도, 천둥번개가 쳐요'
    );
  });
});

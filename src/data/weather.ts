/**
 * Open-Meteo 호출.
 *
 * **키가 없다.** 좌표만 주면 되고, 발급도 활용신청도 승인 대기도 없다.
 * 첫 화면 한 줄을 위해 그 절차를 다시 밟을 이유가 없어서 기상청에서 옮겨 왔다.
 *
 * 실패하면 던지지 않고 null을 준다. 못 읽었을 때 할 일은 **그 줄을 안 그리는 것**이지
 * 오류를 띄우는 게 아니다. 약속에 늦지 않으려고 켠 앱이 날씨 때문에 말을 걸면 안 된다.
 */

import { getApiConfig } from '../config';
import { readCurrent, type Weather } from '../domain/weather';
import type { LatLng } from '../domain/types';

/** 이 이상 걸리면 첫 화면을 붙잡고 있을 이유가 없다. */
const TIMEOUT_MS = 4000;

/**
 * 한 번 부르면 이만큼은 다시 부르지 않는다.
 *
 * Open-Meteo는 15분 간격으로 갱신하므로 더 자주 물어도 같은 답이 온다.
 * 화면을 오갈 때마다 부르면 남의 무료 서비스를 축낼 뿐이다.
 */
const CACHE_MS = 10 * 60 * 1000;

/** 캐시 키. 소수 둘째 자리면 1km 남짓이라 같은 동네는 한 번만 묻는다. */
function cacheKey(at: LatLng): string {
  return `${at.lat.toFixed(2)},${at.lng.toFixed(2)}`;
}

let cache: { at: number; key: string; weather: Weather | null } | null = null;

export async function fetchWeather(at: LatLng, nowMs: number = Date.now()): Promise<Weather | null> {
  const { weather: config } = getApiConfig();
  const key = cacheKey(at);

  if (cache != null && cache.key === key && nowMs - cache.at < CACHE_MS) {
    return cache.weather;
  }

  const params = new URLSearchParams({
    latitude: at.lat.toFixed(4),
    longitude: at.lng.toFixed(4),
    current: 'temperature_2m,weather_code',
    timezone: 'Asia/Seoul',
  });

  const weather = await request(`${config.baseUrl}/v1/forecast?${params}`);

  // 실패도 캐시한다. 막혀 있으면 화면을 오갈 때마다 4초씩 기다리게 된다.
  cache = { at: nowMs, key, weather };
  return weather;
}

async function request(url: string): Promise<Weather | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as { current?: unknown };
    return readCurrent(body.current);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 테스트와 화면 전환 확인용. 앱 코드에서는 부를 일이 없다. */
export function clearWeatherCache(): void {
  cache = null;
}

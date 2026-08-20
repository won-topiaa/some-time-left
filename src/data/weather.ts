/**
 * 기상청 초단기예보 호출.
 *
 * 실패하면 던지지 않고 null을 준다. 날씨는 첫 화면 맨 위 한 줄이라,
 * 못 읽었을 때 할 일은 **그 줄을 안 그리는 것**이지 오류를 띄우는 게 아니다.
 * 약속에 늦지 않으려고 켠 앱이 날씨 때문에 말을 걸면 안 된다.
 */

import { getApiConfig } from '../config';
import { baseTimeFor, firstForecast, toGrid, type ForecastItem, type Weather } from '../domain/weather';
import type { LatLng } from '../domain/types';

/** 이 이상 걸리면 첫 화면을 붙잡고 있을 이유가 없다. */
const TIMEOUT_MS = 4000;

/**
 * 한 번 부르면 이만큼은 다시 부르지 않는다.
 *
 * 초단기예보는 한 시간에 한 번 갱신되므로 더 자주 물어도 같은 답이 온다.
 * 화면을 오갈 때마다 부르면 할당량만 쓴다.
 */
const CACHE_MS = 10 * 60 * 1000;

interface Cached {
  at: number;
  grid: string;
  weather: Weather | null;
}

let cache: Cached | null = null;

interface WeatherResponse {
  response?: {
    body?: {
      items?: { item?: ForecastItem[] };
    };
  };
}

export async function fetchWeather(at: LatLng, nowMs: number = Date.now()): Promise<Weather | null> {
  const { publicData } = getApiConfig();
  if (publicData.serviceKey == null) {
    return null;
  }

  const grid = toGrid(at.lat, at.lng);
  const key = `${grid.nx},${grid.ny}`;

  if (cache != null && cache.grid === key && nowMs - cache.at < CACHE_MS) {
    return cache.weather;
  }

  const { baseDate, baseTime } = baseTimeFor(nowMs);
  const params = new URLSearchParams({
    serviceKey: publicData.serviceKey,
    pageNo: '1',
    // 한 발표에 담기는 항목 수보다 넉넉히. 모자라면 T1H만 오고 SKY가 잘린다.
    numOfRows: '60',
    dataType: 'JSON',
    base_date: baseDate,
    base_time: baseTime,
    nx: String(grid.nx),
    ny: String(grid.ny),
  });

  const weather = await request(`${publicData.weatherBaseUrl}${publicData.weatherPath}?${params}`);

  // 실패도 캐시한다. 키가 없거나 막혀 있으면 화면을 오갈 때마다 4초씩 기다리게 된다.
  cache = { at: nowMs, grid: key, weather };
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
    // 키가 등록 안 됐을 때는 JSON이 아니라 XML 오류가 온다. 그때는 조용히 없는 셈 친다.
    const body = (await response.json()) as WeatherResponse;
    return firstForecast(body.response?.body?.items?.item ?? []);
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

import { useEffect, useState } from 'react';
import { Accuracy, getCurrentLocation } from '@apps-in-toss/framework';
import { fetchWeather } from '../data/weather';
import type { Weather } from '../domain/weather';

/**
 * 지금 날씨. 첫 화면 맨 위 한 줄과, 약속 몇 분 전을 겨눌지가 여기서 나온다.
 *
 * 못 읽으면 null이고, 화면은 그 줄을 안 그리고 맑은 날로 계획한다 — 이 앱이 키 없는
 * 기능을 다루는 방식 그대로다(혼잡도·경치·그늘도 없으면 중립값으로 물러선다).
 *
 * 위치는 `Accuracy.Lowest`(3km)로 충분하다. 날씨 격자가 그보다 성기라 더 정확해도
 * 같은 칸에 떨어지고, 첫 화면을 여는 데 GPS를 오래 붙잡을 이유가 없다.
 * 목적지 검색이 이미 위치를 부르므로 권한이 새로 생기지도 않는다.
 *
 * `refreshKey`가 바뀌면 다시 읽는다. 첫 화면은 다시 보일 때마다 이 값을 올린다 —
 * 아침에 켜 둔 앱으로 저녁 약속을 잡는 날, 그새 비가 시작됐으면 계획도 그걸 알아야
 * 한다. 10분 캐시(`fetchWeather`)가 있어 자주 올려도 서버를 자주 부르지는 않는다.
 */
export function useWeather(refreshKey = 0): Weather | null {
  const [weather, setWeather] = useState<Weather | null>(null);

  useEffect(() => {
    let cancelled = false;

    getCurrentLocation({ accuracy: Accuracy.Lowest })
      .then((position) =>
        fetchWeather({ lat: position.coords.latitude, lng: position.coords.longitude })
      )
      .then((latest) => {
        if (!cancelled) {
          setWeather(latest);
        }
      })
      .catch(() => {
        // 위치를 거절했거나 네트워크가 없다. 날씨 한 줄이 없을 뿐이다.
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return weather;
}

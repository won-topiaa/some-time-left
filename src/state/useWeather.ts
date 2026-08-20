import { useEffect, useState } from 'react';
import { Accuracy, getCurrentLocation } from '@apps-in-toss/framework';
import { fetchWeather } from '../data/weather';
import { weatherLine } from '../domain/weather';

/**
 * 첫 화면 맨 위 한 줄.
 *
 * 못 읽으면 null이고, 화면은 그 줄을 안 그린다 — 이 앱이 키 없는 기능을 다루는
 * 방식 그대로다(혼잡도·경치·그늘도 없으면 중립값으로 물러선다).
 *
 * 위치는 `Accuracy.Lowest`(3km)로 충분하다. 기상청 격자가 5km라 그보다 정확해도
 * 같은 칸에 떨어지고, 첫 화면을 여는 데 GPS를 오래 붙잡을 이유가 없다.
 * 목적지 검색이 이미 위치를 부르므로 권한이 새로 생기지도 않는다.
 */
export function useWeather(): string | null {
  const [line, setLine] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getCurrentLocation({ accuracy: Accuracy.Lowest })
      .then((position) =>
        fetchWeather({ lat: position.coords.latitude, lng: position.coords.longitude })
      )
      .then((weather) => {
        if (!cancelled) {
          setLine(weather == null ? null : weatherLine(weather));
        }
      })
      .catch(() => {
        // 위치를 거절했거나 네트워크가 없다. 날씨 한 줄이 없을 뿐이다.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return line;
}

import { useEffect, useRef, useState } from 'react';
import { Accuracy, getCurrentLocation } from '@apps-in-toss/framework';
import { findPlaces, type Place } from '../data/places';
import type { LatLng } from '../domain/types';

/** 타이핑이 멈추고 이만큼 지나면 검색한다 (ms). */
const DEBOUNCE_MS = 350;

/** 이 글자 수부터 검색한다. */
const MIN_QUERY_LENGTH = 2;

export interface PlaceSearch {
  results: Place[];
  searching: boolean;
}

/**
 * 목적지 검색.
 * 약속 장소는 대개 근처이므로 현재 위치를 넘겨 가까운 곳부터 나오게 한다.
 */
export function usePlaceSearch(query: string): PlaceSearch {
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const near = useRef<LatLng | undefined>(undefined);

  useEffect(() => {
    // 약속 장소는 대개 근처라 가까운 곳부터 보여주려고 현재 위치를 잡아 둔다.
    // 같은 이름의 동이 전국에 238쌍이라(중앙동·연동…), 이 위치가 있어야
    // 오프라인 지역 색인도 "내 동네의 그것"을 앞세울 수 있다.
    getCurrentLocation({ accuracy: Accuracy.Balanced })
      .then((position) => {
        near.current = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);

    const timer = setTimeout(async () => {
      const found = await findPlaces(trimmed, near.current).catch(() => [] as Place[]);
      if (!cancelled) {
        setResults(found);
        setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  return { results, searching };
}

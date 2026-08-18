import { useEffect, useRef, useState } from 'react';
import { Accuracy, getCurrentLocation } from '@apps-in-toss/framework';
import { findPlaces, type Place } from '../data/places';
import { isTmapConfigured } from '../config';
import type { LatLng } from '../domain/types';

/** 타이핑이 멈추고 이만큼 지나면 검색한다 (ms). */
const DEBOUNCE_MS = 350;

/** 이 글자 수부터 검색한다. */
const MIN_QUERY_LENGTH = 2;

export interface PlaceSearch {
  results: Place[];
  searching: boolean;
  /** 검색을 쓸 수 있는 상태인가 (키 미설정이면 false) */
  available: boolean;
}

/**
 * 목적지 검색.
 * 약속 장소는 대개 근처이므로 현재 위치를 넘겨 가까운 곳부터 나오게 한다.
 */
export function usePlaceSearch(query: string): PlaceSearch {
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const near = useRef<LatLng | undefined>(undefined);

  const available = isTmapConfigured();

  useEffect(() => {
    if (!available) {
      return;
    }
    getCurrentLocation({ accuracy: Accuracy.Balanced })
      .then((position) => {
        near.current = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
      })
      .catch(() => {});
  }, [available]);

  useEffect(() => {
    const trimmed = query.trim();

    if (!available || trimmed.length < MIN_QUERY_LENGTH) {
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
  }, [query, available]);

  return { results, searching, available };
}

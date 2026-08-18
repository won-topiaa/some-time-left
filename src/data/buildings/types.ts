import type { LatLng } from '../../domain/types';

export interface Building {
  at: LatLng;
  /** 지상 층수 */
  floors: number;
  /** 높이 (m). 대장에 실측 높이가 있으면 그 값, 없으면 층수로 환산한다. */
  heightM: number;
}

/** 층수 → 높이 환산. 주거·상업 혼재를 감안한 평균값. */
export const METERS_PER_FLOOR = 3.3;

export function heightFromFloors(floors: number): number {
  return Math.max(0, floors) * METERS_PER_FLOOR;
}

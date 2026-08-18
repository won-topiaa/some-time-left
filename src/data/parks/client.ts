/**
 * 전국도시공원표준데이터 (공공데이터포털).
 *
 * 위도·경도와 공원면적, 공원구분을 준다. 폴리곤이 아니라 점 데이터라
 * "공원 안을 지나는가"가 아니라 "공원 옆을 지나는가"로 다룬다.
 * 걷는 사람 입장에서는 그 편이 오히려 맞다 — 공원 담장을 따라 걸어도 기분은 좋으니까.
 */

import { getApiConfig } from '../../config';
import { requestJson } from '../http';
import type { LatLng } from '../../domain/types';

export interface Park {
  name: string;
  at: LatLng;
  /** 공원 면적 (m^2) */
  areaM2: number;
  /** 도시공원 구분. 수변공원·근린공원 등 */
  category: string;
  /** 물가에 면한 공원인가 */
  waterfront: boolean;
}

interface ParkRow {
  parkNm?: string;
  latitude?: string;
  longitude?: string;
  parkAr?: string;
  parkSe?: string;
}

interface ParkResponse {
  response?: {
    body?: {
      items?: ParkRow[];
      totalCount?: number;
    };
  };
}

/**
 * 수변으로 볼 이름·구분.
 * 마지막 항은 '중랑천', '양재천'처럼 하천 이름을 잡기 위한 것이다 —
 * '천호공원'처럼 천으로 시작하는 이름에는 걸리지 않도록 앞 글자를 요구한다.
 */
const WATERFRONT_PATTERN = /수변|하천|강변|호수|해변|한강|[가-힣]{1,3}천(?=\s|$|변|길|로)/;

export function parseParkRow(row: ParkRow): Park | null {
  const lat = Number(row.latitude);
  const lng = Number(row.longitude);

  // 좌표가 없는 행이 섞여 온다.
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) {
    return null;
  }

  const category = row.parkSe ?? '';

  return {
    name: row.parkNm ?? '이름 없는 공원',
    at: { lat, lng },
    areaM2: Number(row.parkAr) || 0,
    category,
    waterfront: WATERFRONT_PATTERN.test(category) || WATERFRONT_PATTERN.test(row.parkNm ?? ''),
  };
}

/**
 * 좌표 주변 공원. 표준데이터 API는 공간 질의를 지원하지 않아
 * 시도/시군구 단위로 받아 로컬에서 거른다. 그래서 한 번 받아 캐싱한다.
 */
export async function fetchParks(sido: string, rows = 1000): Promise<Park[]> {
  const { publicData } = getApiConfig();
  if (publicData.serviceKey == null) {
    return [];
  }

  const params = new URLSearchParams({
    serviceKey: publicData.serviceKey,
    pageNo: '1',
    numOfRows: String(rows),
    type: 'json',
    ctprvnNm: sido,
  });

  const response = await requestJson<ParkResponse>(
    `${publicData.standardDataBaseUrl}${publicData.parkPath}?${params.toString()}`,
    { method: 'GET' }
  );

  const items = response.response?.body?.items ?? [];
  return items.flatMap((row) => {
    const park = parseParkRow(row);
    return park == null ? [] : [park];
  });
}

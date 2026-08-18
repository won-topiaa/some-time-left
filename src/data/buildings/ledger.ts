/**
 * 건축물대장 표제부 (공공데이터포털, 국토교통부).
 *
 * **좌표로는 조회할 수 없다.** 시군구코드·법정동코드·번·지가 있어야 한다.
 * 그래서 경로 전체의 건물 높이를 여기서 얻는 건 불가능하고,
 * 주소를 아는 특정 건물 하나를 정밀하게 볼 때 쓴다 — 예를 들어 목적지 건물.
 *
 * 경로 주변 건물 높이는 공간 질의가 되는 브이월드(`vworld.ts`)가 담당한다.
 */

import { getApiConfig } from '../../config';
import { requestJson } from '../http';
import { heightFromFloors } from './types';

export interface LedgerKey {
  /** 시군구 코드 5자리 */
  sigunguCd: string;
  /** 법정동 코드 5자리 */
  bjdongCd: string;
  /** 번 (4자리, 0 패딩) */
  bun: string;
  /** 지 (4자리, 0 패딩) */
  ji: string;
}

export interface LedgerBuilding {
  name: string;
  /** 지상 층수 */
  floors: number;
  /** 높이 (m). 대장의 실측 높이를 우선한다. */
  heightM: number;
}

interface LedgerRow {
  bldNm?: string;
  grndFlrCnt?: number | string;
  heit?: number | string;
}

interface LedgerResponse {
  response?: {
    body?: {
      items?: { item?: LedgerRow | LedgerRow[] };
    };
  };
}

function toArray(item: LedgerRow | LedgerRow[] | undefined): LedgerRow[] {
  if (item == null) {
    return [];
  }
  return Array.isArray(item) ? item : [item];
}

export function parseLedgerRow(row: LedgerRow): LedgerBuilding | null {
  const floors = Number(row.grndFlrCnt);
  const measured = Number(row.heit);

  if (!Number.isFinite(floors) && !Number.isFinite(measured)) {
    return null;
  }

  const safeFloors = Number.isFinite(floors) ? floors : 0;
  // 대장에 높이가 0으로 들어오는 경우가 흔하다. 그때는 층수로 환산한다.
  const heightM =
    Number.isFinite(measured) && measured > 0 ? measured : heightFromFloors(safeFloors);

  return { name: row.bldNm ?? '', floors: safeFloors, heightM };
}

/** 지번 주소로 건물 높이를 조회한다. 번·지는 4자리로 0을 채워 넣는다. */
export async function fetchLedgerBuildings(key: LedgerKey): Promise<LedgerBuilding[]> {
  const { publicData } = getApiConfig();
  if (publicData.serviceKey == null) {
    return [];
  }

  const params = new URLSearchParams({
    serviceKey: publicData.serviceKey,
    sigunguCd: key.sigunguCd,
    bjdongCd: key.bjdongCd,
    bun: key.bun.padStart(4, '0'),
    ji: key.ji.padStart(4, '0'),
    _type: 'json',
    numOfRows: '20',
  });

  const response = await requestJson<LedgerResponse>(
    `${publicData.ledgerBaseUrl}${publicData.ledgerPath}?${params.toString()}`,
    { method: 'GET' }
  );

  return toArray(response.response?.body?.items?.item).flatMap((row) => {
    const building = parseLedgerRow(row);
    return building == null ? [] : [building];
  });
}

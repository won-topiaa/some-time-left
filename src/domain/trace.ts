/**
 * 지나온 길의 집계.
 *
 * 레퍼런스에서 가장 크게 배운 것: **기록은 쌓이는 게 보여야 기록이다.**
 * 발자취는 누적 거리를, Liltie는 채워진 날들을 첫 화면에 크게 둔다.
 * 우리는 기록을 저장만 하고 어디에도 보여주지 않았다 — 그 구멍을 메우는 계산이 여기다.
 *
 * 다만 "몇 곳 남음" 같은 완주율은 쓰지 않는다. 이 앱은 매일 쓰는 앱이 아니라
 * 어쩌다 시간이 붕 떴을 때만 여는 앱이라, 달성률을 보여주면 대부분의 날이
 * 실패로 보인다. 그래서 목표 없이 **사실만** 센다.
 */

import { pathLengthM } from './geo';
import type { WalkRecord } from './types';

export interface TraceSummary {
  /** 걸은 횟수 */
  count: number;
  /** 누적 거리 (m) */
  totalDistanceM: number;
  /** 한 줄을 남긴 횟수 */
  noteCount: number;
  /** 가장 오래된 기록 시각. 없으면 null. */
  firstAt: number | null;
}

export function traceSummary(records: WalkRecord[]): TraceSummary {
  let totalDistanceM = 0;
  let noteCount = 0;
  let firstAt: number | null = null;

  for (const record of records) {
    // 저장할 때 적어 둔 참값을 쓴다. 좌표는 성기게 솎여 있어 다시 재면 조금 짧다 —
    // 누적 거리는 이 화면의 주인공 숫자라 그 오차를 허용하지 않는다.
    // 옛 기록에는 이 값이 없으므로 그때만 좌표에서 잰다.
    totalDistanceM += record.distanceM ?? pathLengthM(record.path);
    if (record.note.trim() !== '') {
      noteCount += 1;
    }
    if (firstAt == null || record.arrivedAt < firstAt) {
      firstAt = record.arrivedAt;
    }
  }

  return { count: records.length, totalDistanceM, noteCount, firstAt };
}

/** 누적 거리 표기. 발자취처럼 소수 둘째 자리까지 — 반올림하면 쌓이는 맛이 사라진다. */
export function formatTotalDistance(totalM: number): string {
  return (totalM / 1000).toFixed(2);
}

export interface TraceMonth {
  /** 'YYYY-MM' — 정렬과 키에 쓴다 */
  key: string;
  /** 사람에게 보이는 제목 */
  label: string;
  records: WalkRecord[];
}

/**
 * KST 기준 날짜 조각.
 *
 * `Intl.formatToParts`를 쓰지 않는다 — Hermes 빌드에 따라 없을 수 있고, 없으면 조용히
 * NaN이 되어 모든 기록이 "NaN년 NaN월" 한 묶음으로 뭉친다.
 * 한국 표준시는 1988년 이후 서머타임이 없는 고정 UTC+9라, 9시간 더하고 UTC 필드를 읽는
 * 것이 더 정확하면서 의존성도 없다.
 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function kstParts(ms: number): { year: number; month: number; day: number } {
  const shifted = new Date(ms + KST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/**
 * 달별로 묶는다. tash의 피드처럼 시간 순으로 흐르되,
 * 달이 바뀌는 자리에만 제목을 둬서 스크롤에 리듬을 준다.
 * 입력 순서와 무관하게 최신 달이 먼저 온다.
 */
export function groupByMonth(records: WalkRecord[]): TraceMonth[] {
  const buckets = new Map<string, WalkRecord[]>();

  for (const record of records) {
    const { year, month } = kstParts(record.arrivedAt);
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const bucket = buckets.get(key);
    if (bucket == null) {
      buckets.set(key, [record]);
    } else {
      bucket.push(record);
    }
  }

  return [...buckets.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, bucketRecords]) => {
      const [year, month] = key.split('-');
      return {
        key,
        label: `${year}년 ${Number(month)}월`,
        records: [...bucketRecords].sort((a, b) => b.arrivedAt - a.arrivedAt),
      };
    });
}

/** 기록 한 줄의 날짜 표기. 목적지와 나란히 놓이므로 짧게. */
export function formatRecordDate(ms: number): string {
  const { month, day } = kstParts(ms);
  return `${month}월 ${day}일`;
}

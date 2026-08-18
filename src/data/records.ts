/**
 * 걸은 길과 한 줄 기록의 저장.
 *
 * 앱인토스가 주는 Storage를 그대로 쓴다. 서버가 없어도 MVP가 성립하고,
 * 기록은 원래 남에게 보여줄 것이 아니라 본인 것이므로 기기에 두는 편이 맞다.
 */

import { Storage } from '@apps-in-toss/framework';
import type { WalkRecord } from '../domain/types';

const RECORDS_KEY = 'stl:records:v1';
const COMPANIONS_KEY = 'stl:companions:v1';

/** 최근 걸은 길을 다시 추천하지 않기 위해 참조하는 개수. */
const RECENT_WINDOW = 5;

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await Storage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  await Storage.setItem(key, JSON.stringify(value));
}

export async function loadRecords(): Promise<WalkRecord[]> {
  const records = await readJson<WalkRecord[]>(RECORDS_KEY, []);
  // 저장된 값이 손상돼 배열이 아니면 sort에서 터진다. 읽기가 화면을 죽이지 않게 한다.
  if (!Array.isArray(records)) {
    return [];
  }
  return [...records].sort((a, b) => b.arrivedAt - a.arrivedAt);
}

export async function saveRecord(record: WalkRecord): Promise<void> {
  const records = await readJson<WalkRecord[]>(RECORDS_KEY, []);
  await writeJson(RECORDS_KEY, [record, ...records]);
  if (record.companion.trim() !== '') {
    await rememberCompanion(record.companion);
  }
}

/** 최근에 걸은 경로 id들. 같은 길을 반복 추천하지 않기 위해. */
export async function recentRouteIds(): Promise<string[]> {
  const records = await loadRecords();
  return records.slice(0, RECENT_WINDOW).map((r) => r.routeId);
}

/** 이 상대와 지난번엔 어떤 길로 갔는지. */
export async function lastWalkWith(companion: string): Promise<WalkRecord | null> {
  const records = await loadRecords();
  return records.find((r) => r.companion === companion) ?? null;
}

/** 자주 만나는 사람을 입력창 위에 띄우기 위해. */
export async function loadCompanions(): Promise<string[]> {
  return readJson<string[]>(COMPANIONS_KEY, []);
}

async function rememberCompanion(name: string): Promise<void> {
  const existing = await loadCompanions();
  const next = [name, ...existing.filter((c) => c !== name)].slice(0, 8);
  await writeJson(COMPANIONS_KEY, next);
}

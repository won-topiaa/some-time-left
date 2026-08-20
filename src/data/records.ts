/**
 * 걸은 길과 한 줄 기록의 저장.
 *
 * 앱인토스가 주는 Storage를 그대로 쓴다. 서버가 없어도 MVP가 성립하고,
 * 기록은 원래 남에게 보여줄 것이 아니라 본인 것이므로 기기에 두는 편이 맞다.
 */

import { Storage } from '@apps-in-toss/framework';
import { compactPath, pathLengthM } from '../domain/geo';
import type { WalkRecord } from '../domain/types';

const RECORDS_KEY = 'stl:records:v1';
const COMPANIONS_KEY = 'stl:companions:v1';
const CARRIED_KEY = 'stl:carried:v1';

/** 최근 걸은 길을 다시 추천하지 않기 위해 참조하는 개수. */
const RECENT_WINDOW = 5;

/**
 * 낱낱이 들고 있을 기록의 최대 개수.
 *
 * 매일 걸어도 1년이 넘는 양이다. 다만 무제한으로 두면 길 찾을 때마다 파싱하는
 * JSON이 계속 커지므로 어딘가에서 끊어야 한다. 끊더라도 **누적 숫자는 줄지 않는다** —
 * 밀려난 기록은 아래 `CarriedTotals`로 옮겨 담는다.
 */
const MAX_RECORDS = 400;

/**
 * 목록에서 밀려난 기록들의 합.
 *
 * '지나온 길'의 주인공은 누적 거리라서, 오래된 걸 지웠다고 그 숫자가 줄면
 * 이 앱이 기록이라고 말할 수 없게 된다. 낱낱은 버리되 합은 남긴다.
 */
export interface CarriedTotals {
  count: number;
  distanceM: number;
  noteCount: number;
}

export const NO_CARRIED: CarriedTotals = { count: 0, distanceM: 0, noteCount: 0 };

/**
 * 읽기에 관대한 버전. 못 읽으면 없는 셈 친다.
 * 화면에 보여주기만 하는 곳에서 쓴다 — 못 읽어서 비는 건 그 순간의 손해로 끝난다.
 */
async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await Storage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/**
 * 읽기에 엄격한 버전. **덮어쓰기 전에는 반드시 이걸 쓴다.**
 *
 * 관대한 쪽은 "저장된 게 없다"와 "못 읽었다"를 구분하지 못한다. 그 값을 그대로
 * 이어 붙여 다시 쓰면, 한 번의 일시적 읽기 실패가 지금까지 걸은 기록 전부를
 * 조용히 지운다 — 되돌릴 방법도, 알아챌 방법도 없다.
 * 정말 비어 있을 때(null)만 빈 배열을 주고, 실패는 실패로 올려보낸다.
 */
async function readJsonStrict<T>(key: string, empty: T): Promise<T> {
  const raw = await Storage.getItem(key);
  if (raw == null) {
    return empty;
  }
  return JSON.parse(raw) as T;
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
  // 못 읽었으면 여기서 던진다. 덮어쓰지 않는 것이 한 건을 더 남기는 것보다 중요하다.
  const existing = await readJsonStrict<WalkRecord[]>(RECORDS_KEY, []);
  const records = Array.isArray(existing) ? existing : [];

  // 좌표는 솎아서 넣되, 누적 거리는 솎기 전 참값으로 적어 둔다.
  const stored: WalkRecord = {
    ...record,
    distanceM: record.distanceM ?? pathLengthM(record.path),
    path: compactPath(record.path),
  };

  const next = [stored, ...records];

  // 넘치는 만큼은 합으로 옮겨 담는다. 낱낱은 사라져도 누적 숫자는 그대로다.
  if (next.length > MAX_RECORDS) {
    const dropped = next.slice(MAX_RECORDS);
    await carryOver(dropped);
    await writeJson(RECORDS_KEY, next.slice(0, MAX_RECORDS));
  } else {
    await writeJson(RECORDS_KEY, next);
  }

  // 기록은 이미 남았다. 이름 목록은 편의 기능일 뿐이라 여기서 실패해도
  // 위 저장까지 실패한 것처럼 보이게 하지 않는다.
  if (record.companion.trim() !== '') {
    await rememberCompanion(record.companion).catch(() => {});
  }
}

/** 목록에서 밀려난 기록들을 합에 더한다. */
async function carryOver(dropped: WalkRecord[]): Promise<void> {
  const existing = await readJsonStrict<CarriedTotals>(CARRIED_KEY, NO_CARRIED);
  const base =
    existing != null && typeof existing.count === 'number' ? existing : NO_CARRIED;

  const next: CarriedTotals = {
    count: base.count + dropped.length,
    distanceM:
      base.distanceM +
      dropped.reduce((sum, r) => sum + (r.distanceM ?? pathLengthM(r.path)), 0),
    noteCount: base.noteCount + dropped.filter((r) => r.note.trim() !== '').length,
  };

  await writeJson(CARRIED_KEY, next);
}

/** 목록에서 밀려난 기록들의 합. 없으면 0. */
export async function loadCarried(): Promise<CarriedTotals> {
  const carried = await readJson<CarriedTotals>(CARRIED_KEY, NO_CARRIED);
  return carried != null && typeof carried.count === 'number' ? carried : NO_CARRIED;
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
  const names = await readJson<string[]>(COMPANIONS_KEY, []);
  return Array.isArray(names) ? names : [];
}

async function rememberCompanion(name: string): Promise<void> {
  // 여기도 덮어쓰기라 엄격하게 읽는다. 다만 이름 목록은 편의 기능이라
  // 실패해도 기록 저장까지 막지는 않는다 — saveRecord가 이미 끝난 뒤다.
  const existing = await readJsonStrict<string[]>(COMPANIONS_KEY, []);
  const names = Array.isArray(existing) ? existing : [];
  const next = [name, ...names.filter((c) => c !== name)].slice(0, 8);
  await writeJson(COMPANIONS_KEY, next);
}

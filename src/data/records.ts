/**
 * 걸은 길과 한 줄 기록의 저장.
 *
 * 앱인토스가 주는 Storage를 그대로 쓴다. 서버가 없어도 MVP가 성립하고,
 * 기록은 원래 남에게 보여줄 것이 아니라 본인 것이므로 기기에 두는 편이 맞다.
 */

import { Storage } from '@apps-in-toss/framework';
import { compactPath, pathLengthM } from '../domain/geo';
import { NO_CARRIED, addToCarried, type CarriedTotals } from '../domain/trace';
import type { LatLng, WalkRecord } from '../domain/types';

export { NO_CARRIED, type CarriedTotals };

const RECORDS_KEY = 'stl:records:v1';

/** 최근 걸은 길을 다시 추천하지 않기 위해 참조하는 개수. */
/**
 * "최근에 걸은 길" 감점이 보는 창의 크기.
 *
 * 이 값을 쓰는 곳(useRouteSuggestion)이 기록을 이미 읽어 들고 있어서 함수 대신
 * 상수를 내보낸다 — 같은 목록을 두 번 읽지 않으면서도 숫자가 한 군데만 있게.
 */
export const RECENT_WINDOW = 5;

/**
 * 낱낱이 들고 있을 기록의 최대 개수.
 *
 * 매일 걸어도 1년이 넘는 양이다. 다만 무제한으로 두면 길 찾을 때마다 파싱하는
 * JSON이 계속 커지므로 어딘가에서 끊어야 한다. 끊더라도 **누적 숫자는 줄지 않는다** —
 * 밀려난 기록은 아래 `CarriedTotals`로 옮겨 담는다.
 */
const MAX_RECORDS = 400;

/**
 * 저장에 실제로 들어가는 모양.
 *
 * 낱낱의 기록과 밀려난 것들의 합을 **한 키에 함께** 둔다. 예전엔 둘을 따로 썼는데,
 * 합을 먼저 쓰고 목록 쓰기가 실패하면 밀려난 기록이 목록에도 남고 합에도 들어가
 * 다음 저장 때 또 더해진다 — '지나온 길'의 누적 거리가 슬금슬금 부풀어 오른다.
 * 한 번에 쓰면 둘이 어긋날 수가 없다.
 */
interface RecordStore {
  records: WalkRecord[];
  carried: CarriedTotals;
}

const EMPTY_STORE: RecordStore = { records: [], carried: NO_CARRIED };

/** 예전 형태(배열만)도 읽을 수 있게 한다. */
function toStore(raw: unknown): RecordStore {
  if (Array.isArray(raw)) {
    return { records: raw as WalkRecord[], carried: NO_CARRIED };
  }
  if (raw != null && typeof raw === 'object') {
    const value = raw as Partial<RecordStore>;
    const carried = value.carried;
    return {
      records: Array.isArray(value.records) ? value.records : [],
      carried:
        carried != null && typeof carried.count === 'number' ? carried : NO_CARRIED,
    };
  }
  return EMPTY_STORE;
}

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
  const store = toStore(await readJson<unknown>(RECORDS_KEY, null));
  return [...store.records].sort((a, b) => b.arrivedAt - a.arrivedAt);
}

export async function saveRecord(record: WalkRecord): Promise<void> {
  // 못 읽었으면 여기서 던진다. 덮어쓰지 않는 것이 한 건을 더 남기는 것보다 중요하다.
  const store = toStore(await readJsonStrict<unknown>(RECORDS_KEY, null));

  // 좌표는 솎아서 넣되, 누적 거리는 솎기 전 참값으로 적어 둔다.
  const stored: WalkRecord = {
    ...record,
    distanceM: record.distanceM ?? pathLengthM(record.path),
    path: compactPath(record.path),
  };

  const next = [stored, ...store.records];

  // 넘치는 만큼은 합으로 옮겨 담는다. 낱낱은 사라져도 누적 숫자는 그대로다.
  // 목록과 합을 한 번에 써야 둘이 어긋나지 않는다.
  await writeJson(RECORDS_KEY, {
    records: next.slice(0, MAX_RECORDS),
    carried: addToCarried(store.carried, next.slice(MAX_RECORDS)),
  } satisfies RecordStore);
}

/** 목록에서 밀려난 기록들의 합. 없으면 0. */
export async function loadCarried(): Promise<CarriedTotals> {
  return toStore(await readJson<unknown>(RECORDS_KEY, null)).carried;
}



/** 첫 화면에 띄울 최근 목적지의 최대 개수. 세 개가 넘으면 검색보다 고르는 게 더 일이 된다. */
const RECENT_PLACES = 3;

export interface RecentPlace {
  name: string;
  at: LatLng;
}

/**
 * 최근에 간 곳.
 *
 * 매주 같은 곳에서 만나는 사람이 매번 같은 이름을 검색하는 건 이 앱이 없애기로 한
 * 종류의 수고다. 좌표가 남아 있는 기록만 쓴다 — 이름만으로는 다시 검색을 시켜야 해서
 * 눌러도 얻는 게 없다(옛 기록에는 좌표가 없다).
 *
 * 같은 곳은 한 번만. 이름이 같으면 같은 곳으로 본다.
 */
export async function recentPlaces(): Promise<RecentPlace[]> {
  const records = await loadRecords();
  const seen = new Set<string>();
  const places: RecentPlace[] = [];

  for (const record of records) {
    const name = record.destinationName.trim();
    if (name === '' || record.destination == null || seen.has(name)) {
      continue;
    }
    seen.add(name);
    places.push({ name, at: record.destination });
    if (places.length === RECENT_PLACES) {
      break;
    }
  }

  return places;
}

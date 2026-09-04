/**
 * 저장소에서 읽은 것을 화면에 올려도 되는 모양으로 만든다.
 *
 * **왜 이 파일이 필요한가.** 이 앱의 기록 스키마는 이미 두 번 늘었다 —
 * `destination`(최근 목적지 칩)과 `distanceM`(솎기 전 참값)은 나중에 붙었고,
 * 그 이전에 저장된 기록이 지금도 기기에 그대로 있다. 스키마가 는다는 것은
 * **저장소에 있는 모양을 우리가 다 알지는 못한다**는 뜻이다.
 *
 * 그런데 읽는 쪽은 전부 모양을 믿고 있었다. 한 줄만 어긋나도 이렇게 된다 —
 *
 *   - `moodById(record.mood)`는 모르는 기분이면 **던진다**.
 *   - `record.note.trim()`은 note가 없으면 던진다.
 *   - `pathLengthM(record.path)`는 path가 없으면 던진다.
 *   - 좌표에 NaN이 하나 섞이면 누적 거리가 통째로 NaN이 된다.
 *
 * 그리고 '지나온 길' 화면은 `traceSummary`·`groupByMonth`를 **렌더 중에** 부른다.
 * 거기서 던지면 _app.tsx의 ErrorBoundary까지 올라가 앱 전체가 "시작하지 못했어요"가
 * 된다. 기록 한 줄 때문에 앱이 영영 안 열리는 것이다 — 저장소를 지우기 전에는
 * 다시 열어도 같은 화면이다.
 *
 * 그래서 경계를 여기 하나 둔다. 읽는 쪽은 이제 모양을 믿어도 된다.
 *
 * **고칠 수 있는 것은 고치고, 못 쓰는 것만 버린다.** 이 앱에서 유일하게 쌓이는
 * 것이 누적 거리라 한 줄이라도 함부로 버리면 그 숫자가 조용히 줄어든다.
 * 버리는 기준은 하나뿐이다 — 시각이 없는 기록. 모든 화면이 시각으로 묶고
 * 정렬하므로 그건 놓을 자리가 없다(예전에 실제로 'NaN년 NaN월' 묶음이 나왔다).
 */

import { MOODS } from '../domain/mood';
import { NO_CARRIED, type CarriedTotals } from '../domain/trace';
import type { LatLng, MoodId, WalkRecord } from '../domain/types';

const MOOD_IDS = new Set<string>(MOODS.map((m) => m.id));

/** 모르는 기분이 왔을 때 앉힐 자리. 여섯 중 가장 색이 옅은 것으로 둔다. */
const NEUTRAL_MOOD: MoodId = 'plain';

function isFinite_(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** 문자열이 아니면 빈 문자열. `.trim()`을 부르는 곳이 여럿이라 null을 남기지 않는다. */
function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * 좌표 하나.
 *
 * 범위까지 본다. NaN만 걸러도 `distanceM`은 숫자를 내놓지만, 위도 900 같은 값이
 * 섞이면 누적 거리가 지구 몇 바퀴로 뛰고 지도는 아무 데도 아닌 곳을 비춘다.
 */
function point(value: unknown): LatLng | null {
  if (value == null || typeof value !== 'object') {
    return null;
  }
  const { lat, lng } = value as Partial<LatLng>;
  if (!isFinite_(lat) || !isFinite_(lng)) {
    return null;
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }
  return { lat, lng };
}

/** 쓸 수 있는 좌표만 남긴다. 배열이 아니면 빈 길. */
function path(value: unknown): LatLng[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: LatLng[] = [];
  for (const item of value) {
    const p = point(item);
    if (p != null) {
      out.push(p);
    }
  }
  return out;
}

/**
 * 기록 한 줄. 못 쓰면 null.
 *
 * 이 함수를 지나온 것은 `WalkRecord`의 모든 필드가 제 타입이라고 **약속한다**.
 * 화면과 도메인은 그 약속 위에서만 모양을 믿는다.
 */
export function sanitizeRecord(raw: unknown): WalkRecord | null {
  if (raw == null || typeof raw !== 'object') {
    return null;
  }
  const value = raw as Partial<WalkRecord>;

  // 시각 없는 기록은 놓을 자리가 없다. 여기서만 버린다.
  if (!isFinite_(value.arrivedAt)) {
    return null;
  }

  const mood = typeof value.mood === 'string' && MOOD_IDS.has(value.mood)
    ? (value.mood as MoodId)
    : NEUTRAL_MOOD;

  const walked = path(value.path);
  const destination = point(value.destination);
  // 음수 거리는 없다. 있으면 좌표에서 다시 재게 두는 편이 낫다.
  const distanceM =
    isFinite_(value.distanceM) && value.distanceM >= 0 ? value.distanceM : undefined;

  const record: WalkRecord = {
    // id는 메모를 얹을 때 그 한 줄을 찾는 열쇠다. 없으면 시각으로 하나 만든다 —
    // 버리는 것보다 낫고, 같은 밀리초에 두 번 걷는 일은 없다.
    id: text(value.id) !== '' ? text(value.id) : `record-${value.arrivedAt}`,
    companion: text(value.companion),
    mood,
    note: text(value.note),
    arrivedAt: value.arrivedAt,
    destinationName: text(value.destinationName),
    path: walked,
    routeId: text(value.routeId),
  };

  // 없는 값은 넣지 않는다. `?? pathLengthM(path)`로 받는 쪽이 여럿이라
  // undefined를 **키까지** 만들어 두면 옛 기록과 구분이 안 된다.
  if (destination != null) {
    record.destination = destination;
  }
  if (distanceM != null) {
    record.distanceM = distanceM;
  }
  return record;
}

export function sanitizeRecords(raw: unknown): WalkRecord[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: WalkRecord[] = [];
  for (const item of raw) {
    const record = sanitizeRecord(item);
    if (record != null) {
      out.push(record);
    }
  }
  return out;
}

/**
 * 밀려난 기록들의 합.
 *
 * **필드마다 따로 고친다.** 셋 중 하나가 상했다고 통째로 0으로 되돌리면 몇 년치
 * 누적 거리가 한 번에 사라진다 — 이 앱에서 가장 아까운 숫자가 가장 조용히 없어지는
 * 셈이다. 상한 칸만 0으로 두고 나머지는 지킨다.
 */
export function sanitizeCarried(raw: unknown): CarriedTotals {
  if (raw == null || typeof raw !== 'object') {
    return NO_CARRIED;
  }
  const value = raw as Partial<CarriedTotals>;
  const nonNegative = (n: unknown): number => (isFinite_(n) && n >= 0 ? n : 0);
  return {
    count: nonNegative(value.count),
    distanceM: nonNegative(value.distanceM),
    noteCount: nonNegative(value.noteCount),
  };
}

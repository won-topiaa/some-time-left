import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 앱인토스 Storage를 메모리로 흉내 낸다. 실패를 흉내 낼 수 있게 열어 둔다. */
const memory = new Map<string, string>();
let failWrites = false;

vi.mock('@apps-in-toss/framework', () => ({
  Storage: {
    getItem: async (key: string) => memory.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      if (failWrites) {
        throw new Error('저장 실패');
      }
      memory.set(key, value);
    },
  },
}));

import {
  loadCarried,
  loadRecords,
  recentPlaces,
  saveRecord,
  updateRecordNote,
} from '../records';
import { moodById } from '../../domain/mood';
import type { WalkRecord } from '../../domain/types';

const KEY = 'stl:records:v1';

const record = (i: number, patch: Partial<WalkRecord> = {}): WalkRecord => ({
  id: `${i}`,
  companion: '',
  mood: 'plain',
  note: '',
  arrivedAt: i,
  destinationName: '어딘가',
  // 남북 111m. 참값이 남는지 보려면 길이가 있어야 한다.
  path: [
    { lat: 37.5, lng: 127 },
    { lat: 37.501, lng: 127 },
  ],
  routeId: 'r',
  ...patch,
});

describe('records', () => {
  beforeEach(() => {
    memory.clear();
    failWrites = false;
  });

  it('비어 있으면 빈 목록과 0', async () => {
    expect(await loadRecords()).toEqual([]);
    expect(await loadCarried()).toEqual({ count: 0, distanceM: 0, noteCount: 0 });
  });

  it('옛 형태(배열만)도 읽고, 한 번 저장하면 새 형태로 옮긴다', async () => {
    memory.set(KEY, JSON.stringify([record(1)]));
    expect(await loadRecords()).toHaveLength(1);

    await saveRecord(record(2));
    expect(JSON.parse(memory.get(KEY)!)).toMatchObject({
      records: [{ id: '2' }, { id: '1' }],
      carried: { count: 0 },
    });
  });

  /**
   * 저장소에서 온 것은 화면에 닿기 전에 걸러진다.
   *
   * 스키마는 이미 두 번 늘었고(destination·distanceM), 그 이전 모양이 기기에
   * 그대로 있다. 그래서 `loadRecords`는 **모양을 모르는 값**을 읽는 함수다.
   * 여기서 안 거르면 '지나온 길'이 렌더 중에 던져 앱 전체가 못 열리게 된다 —
   * 거르는 자리가 `record-schema.ts`고, 그 자리로 가는 길이 여기다.
   */
  it('저장소가 상한 줄을 내놔도 목록은 화면에 올릴 수 있는 모양으로 온다', async () => {
    memory.set(
      KEY,
      JSON.stringify({
        records: [
          record(3),
          null,
          { arrivedAt: 2, mood: 'furious' },
          { note: '시각이 없어 버려진다' },
        ],
        carried: { count: 2, distanceM: NaN, noteCount: 1 },
      })
    );

    const loaded = await loadRecords();
    // 시각 없는 두 줄(null, note만 있는 것)만 빠진다. 나머지는 지킨다.
    expect(loaded).toHaveLength(2);
    for (const item of loaded) {
      expect(Number.isFinite(item.arrivedAt)).toBe(true);
      expect(typeof item.note).toBe('string');
      expect(Array.isArray(item.path)).toBe(true);
      expect(() => moodById(item.mood)).not.toThrow();
    }
    // 상한 칸만 0이 되고 나머지 누적은 살아남는다.
    expect(await loadCarried()).toEqual({ count: 2, distanceM: 0, noteCount: 1 });
  });

  it('상한 줄이 섞여 있어도 새 기록을 저장할 수 있다', async () => {
    // 저장은 엄격하게 읽고 밀려난 것을 합으로 옮긴다. 그 길에 상한 줄이 있으면
    // 예전엔 통째로 던져서 **그날 걸은 것이 조용히 사라졌다.**
    memory.set(KEY, JSON.stringify({ records: [null, { arrivedAt: 1 }], carried: null }));
    await expect(saveRecord(record(9))).resolves.toBeUndefined();
    expect((await loadRecords())[0].id).toBe('9');
  });

  it('최신이 앞에 온다', async () => {
    await saveRecord(record(1));
    await saveRecord(record(3));
    await saveRecord(record(2));
    expect((await loadRecords()).map((r) => r.id)).toEqual(['3', '2', '1']);
  });

  it('좌표는 솎아 넣되 거리는 참값을 적는다', async () => {
    const dense = Array.from({ length: 41 }, (_, i) => ({ lat: 37.5 + i * 0.00005, lng: 127 }));
    await saveRecord(record(1, { path: dense }));
    const [saved] = await loadRecords();
    expect(saved.path.length).toBeLessThan(dense.length);
    expect(saved.distanceM).toBeCloseTo(222.6, 0);
  });

  it('401번째부터는 합으로 옮겨 담고 누적은 줄지 않는다', async () => {
    for (let i = 0; i < 402; i += 1) {
      await saveRecord(record(i, { note: i % 2 === 0 ? '한 줄' : '' }));
    }
    const list = await loadRecords();
    const carried = await loadCarried();
    expect(list).toHaveLength(400);
    expect(carried.count).toBe(2);
    expect(carried.noteCount).toBe(1);
    expect(carried.distanceM).toBeCloseTo(2 * 111.2, 0);
    // 밀려난 것은 가장 오래된 둘이다.
    expect(list.map((r) => r.id)).not.toContain('0');
    expect(list.map((r) => r.id)).not.toContain('1');
  });

  it('깨진 저장소: 읽기는 없는 셈 치고, 저장은 던져서 덮어쓰지 않는다', async () => {
    memory.set(KEY, '{깨진 json');
    expect(await loadRecords()).toEqual([]);
    await expect(saveRecord(record(1))).rejects.toThrow();
    expect(memory.get(KEY)).toBe('{깨진 json');
  });

  it('쓰기가 실패하면 던진다 — 도착 화면이 "다시 저장하기"를 띄울 수 있게', async () => {
    failWrites = true;
    await expect(saveRecord(record(1))).rejects.toThrow();
    failWrites = false;
    await saveRecord(record(1));
    expect(await loadRecords()).toHaveLength(1);
  });

  describe('updateRecordNote', () => {
    it('그 기록의 한 줄만 바꾼다', async () => {
      await saveRecord(record(1));
      await saveRecord(record(2));
      await updateRecordNote('1', '다시 들어와서 적음');
      const list = await loadRecords();
      expect(list.find((r) => r.id === '1')?.note).toBe('다시 들어와서 적음');
      expect(list.find((r) => r.id === '2')?.note).toBe('');
      expect(list).toHaveLength(2);
    });

    it('없는 id면 아무것도 안 한다 — 되살려 두 번 세지 않는다', async () => {
      await saveRecord(record(1));
      await updateRecordNote('없음', '말');
      expect(await loadRecords()).toHaveLength(1);
      expect(await loadCarried()).toEqual({ count: 0, distanceM: 0, noteCount: 0 });
    });

    it('깨진 저장소에는 손대지 않는다', async () => {
      memory.set(KEY, '[깨진');
      await expect(updateRecordNote('1', '말')).rejects.toThrow();
      expect(memory.get(KEY)).toBe('[깨진');
    });
  });

  describe('recentPlaces', () => {
    it('좌표 있는 기록에서 이름으로 하나씩, 최대 셋', () => {
      const list: WalkRecord[] = [
        record(7, { destinationName: '카페', destination: { lat: 1, lng: 1 } }),
        record(6, { destinationName: '카페', destination: { lat: 2, lng: 2 } }),
        record(5, { destinationName: '  ', destination: { lat: 3, lng: 3 } }),
        record(4, { destinationName: '옛 기록(좌표 없음)' }),
        record(3, { destinationName: '회사', destination: { lat: 4, lng: 4 } }),
        record(2, { destinationName: '집', destination: { lat: 5, lng: 5 } }),
        record(1, { destinationName: '넷째', destination: { lat: 6, lng: 6 } }),
      ];
      expect(recentPlaces(list)).toEqual([
        { name: '카페', at: { lat: 1, lng: 1 } },
        { name: '회사', at: { lat: 4, lng: 4 } },
        { name: '집', at: { lat: 5, lng: 5 } },
      ]);
    });

    it('기록이 없으면 빈 목록', () => {
      expect(recentPlaces([])).toEqual([]);
    });
  });
});

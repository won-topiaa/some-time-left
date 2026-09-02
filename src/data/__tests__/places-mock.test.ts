import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { findPlaces } from '../places';
import { configureApi, isTmapConfigured } from '../../config';
import { SEOUL_HOTSPOTS } from '../seoul/hotspots';
import type { LatLng } from '../../domain/types';

/**
 * 키 없이 도는 화면의 목적지 검색.
 *
 * TMAP 키가 없으면 진짜 검색이 없다. 그때 findPlaces가 빈 목록을 주면 목적지를
 * 못 골라 첫 화면에 갇힌다 — 경로가 mock으로 떨어지도록 만든 의미가 사라진다.
 * 그래서 키가 없을 땐 서울 실좌표(SEOUL_HOTSPOTS)를 목적지로 빌려 준다.
 */
describe('findPlaces — 키 없을 때 mock 목적지', () => {
  // 키가 없으면 OSM(Photon)이 먼저 답한다. 이 테스트는 그마저 못 읽는 날의
  // 마지막 안전망(핫스팟)을 보는 것이라 네트워크를 끊어 둔다.
  const realFetch = globalThis.fetch;
  beforeAll(() => {
    globalThis.fetch = (() => Promise.reject(new Error('offline'))) as typeof fetch;
  });
  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  beforeEach(() => {
    // 이 테스트의 전제: 키가 없는 상태. 기본 설정이 그렇지만 명시해 둔다.
    configureApi({ tmap: { appKey: null } });
    expect(isTmapConfigured()).toBe(false);
  });

  it('장소 이름으로 실좌표 목적지를 돌려준다', async () => {
    const found = await findPlaces('강남');
    expect(found.length).toBeGreaterThan(0);
    // 하나하나가 진짜 좌표를 가져야 골라서 걷기까지 이어진다.
    for (const place of found) {
      expect(place.name).toContain('강남');
      expect(Number.isFinite(place.at.lat)).toBe(true);
      expect(Number.isFinite(place.at.lng)).toBe(true);
    }
  });

  it('돌려준 좌표는 실제 목록의 좌표 그대로다', async () => {
    const [top] = await findPlaces('강남역');
    const source = SEOUL_HOTSPOTS.find((spot) => spot.areaName === top.name);
    expect(source).toBeDefined();
    expect(top.at).toEqual(source!.at);
  });

  it('영문 이름은 대소문자를 가리지 않는다', async () => {
    const upper = await findPlaces('DDP');
    const lower = await findPlaces('ddp');
    expect(upper.length).toBeGreaterThan(0);
    expect(lower.map((p) => p.name)).toEqual(upper.map((p) => p.name));
  });

  it('빈 입력에는 아무것도 주지 않는다', async () => {
    expect(await findPlaces('   ')).toEqual([]);
  });

  it('없는 곳을 치면 빈 목록 — 지어내지 않는다', async () => {
    expect(await findPlaces('존재하지않는장소명xyz')).toEqual([]);
  });

  it('한 번에 여덟 곳까지만 (검색 결과가 화면을 덮지 않게)', async () => {
    // 한 글자는 아주 많이 걸린다. 상한이 없으면 목록이 화면을 통째로 채운다.
    const found = await findPlaces('역');
    expect(found.length).toBeLessThanOrEqual(8);
  });

  it('현재 위치를 주면 가까운 곳부터', async () => {
    // 강남역 바로 옆에 서 있다고 하면, '역'으로 검색해도 강남역이 앞쪽에 온다.
    const nearGangnam: LatLng = { lat: 37.498, lng: 127.0276 };
    const found = await findPlaces('역', nearGangnam);
    const names = found.map((p) => p.name);
    const gangnam = names.indexOf('강남역');
    expect(gangnam).toBeGreaterThanOrEqual(0);
    // 멀리 있는 역(예: 고덕역 37.55,127.15)보다 앞에 있어야 한다.
    const godeok = names.indexOf('고덕역');
    if (godeok >= 0) {
      expect(gangnam).toBeLessThan(godeok);
    }
  });
});

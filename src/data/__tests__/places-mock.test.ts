import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { findPlaces } from '../places';
import { configureApi, isTmapConfigured } from '../../config';
import { SEOUL_HOTSPOTS } from '../seoul/hotspots';
import { KOREA_STATIONS } from '../stations/korea';
import type { LatLng } from '../../domain/types';

/**
 * 오프라인 바닥 중 서울 핫스팟 쪽 — 역·공원·번화가 122곳.
 *
 * 지역(동·구·시)은 전국 색인(`regions/`)이 받고, 그 색인에 없는 서울의 역과
 * 명소는 여기가 받는다. 둘 다 번들 안에 있어 네트워크와 무관하다.
 * 이 파일은 핫스팟 쪽의 성질(실좌표 그대로, 대소문자 무시, 가까운 순, 상한 8)을 본다.
 */
describe('findPlaces — 오프라인 바닥: 서울 핫스팟', () => {
  // 온라인(Photon·TMAP)이 죽어도 이 결과는 그대로여야 하므로 네트워크를 끊어 둔다.
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

  /*
   * 이 테스트가 지키는 것은 "좌표를 지어내지 않는다"다. 한때 키가 없으면 좌표를
   * 만들어 내는 공급자로 떨어졌고, 산자락을 가로지르는 삼각형이 실기기에 떴다.
   *
   * 출처는 둘이 됐다. 역 색인이 생기면서 '강남역'처럼 두 목록에 다 있는 이름은
   * 역 색인이 받는다 — OSM의 역 노드라 걸어갈 자리가 더 정확하다(핫스팟 좌표는
   * 혼잡도를 재는 지점이라 역 자체가 아니다. 강남역의 두 좌표는 110m 떨어져 있다).
   * 어느 쪽이든 **번들 안 목록의 값 그대로**여야 한다는 약속은 그대로다.
   */
  it('돌려준 좌표는 실제 목록의 좌표 그대로다', async () => {
    const [top] = await findPlaces('강남역');
    const hotspot = SEOUL_HOTSPOTS.find((spot) => spot.areaName === top.name);
    const station = KOREA_STATIONS.find((row) => row[0] === top.name);

    const verbatim =
      (hotspot != null && hotspot.at.lat === top.at.lat && hotspot.at.lng === top.at.lng) ||
      (station != null && station[1] === top.at.lat && station[2] === top.at.lng);
    expect(verbatim, `${top.name} ${top.at.lat},${top.at.lng}는 어느 목록에도 없는 좌표다`).toBe(
      true
    );
  });

  it('강남역은 역 색인이 받는다 — 역 노드가 걸어갈 자리다', async () => {
    const [top] = await findPlaces('강남역');
    const station = KOREA_STATIONS.find((row) => row[0] === '강남역');

    expect(station).toBeDefined();
    expect(top.at).toEqual({ lat: station![1], lng: station![2] });
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

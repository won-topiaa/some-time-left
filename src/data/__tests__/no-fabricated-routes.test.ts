import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { RoadRouteProvider } from '../road-route-provider';
import type { ParsedRoute } from '../tmap/parse';
import type { LatLng } from '../../domain/types';

/**
 * 이 파일은 기능이 아니라 **약속**을 지킨다.
 *
 * 한 번은 이렇게 됐다. 키가 없으면 좌표를 지어내는 공급자로 떨어지는 삼항 연산자가
 * 하나 있었고, 빌드 스크립트는 키가 null인 설정을 매번 자동으로 만들었다.
 * 그래서 산자락을 가로지르는 삼각형이 "3분 전에는 닿는 길이에요"와 함께 실기기에
 * 떴다. 그때 그 동작을 검증하는 테스트까지 있었다 — 어떤 회귀 테스트도 이걸
 * 잡을 수 없었다는 뜻이다.
 *
 * 그래서 지우는 것으로 끝내지 않고 여기에 못을 박는다. 6개월 뒤에 누군가
 * "개발할 때 편하니까" 하고 되살리면 이 테스트가 먼저 깨진다.
 */

const SRC = join(__dirname, '..', '..');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // 테스트는 가짜 좌표를 만들어도 된다 — 화면에 안 나가니까.
      if (entry === '__tests__' || entry === 'vendor' || entry === 'node_modules') {
        continue;
      }
      out.push(...sourceFiles(full));
      continue;
    }
    if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

describe('가짜 좌표는 출하 경로에 없다', () => {
  it('RouteProvider를 직접 구현하는 곳은 road-route-provider 하나뿐이다', () => {
    /*
     * 공급자가 늘어나는 것 자체는 좋다. 다만 전부 `RoadRouteProvider`를 거쳐야
     * 겨냥·보정 라운드와 **기하 관문**을 함께 물려받는다. 인터페이스를 직접
     * 구현하면 그 관문을 건너뛸 수 있고, 지워진 그 공급자가 정확히 그랬다.
     */
    const offenders = sourceFiles(SRC)
      .filter((file) => /implements\s+RouteProvider/.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(SRC.length + 1));

    expect(offenders).toEqual(['data/road-route-provider.ts']);
  });

  it('되살아난 mock 공급자가 없다', () => {
    const revived = sourceFiles(SRC)
      .filter((file) => /class\s+\w*Mock\w*RouteProvider/.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(SRC.length + 1));

    expect(revived).toEqual([]);
  });
});

/** 도로망이 삼각형을 돌려줬다고 치고 공급자가 무엇을 하는지 본다. */
function providerReturning(path: LatLng[]): RoadRouteProvider {
  const parsed: ParsedRoute = {
    path,
    distanceM: 1800,
    durationSec: 1440,
    crossings: null,
    stairs: null,
  };
  return new RoadRouteProvider({
    fetchRoute: async () => parsed,
    idPrefix: 'test',
  });
}

describe('공급자가 걸을 수 없는 좌표를 받으면', () => {
  const origin = { lat: 37.5052, lng: 126.9575 };
  const destination = { lat: 37.5087, lng: 126.9637 };

  it('그려 낸 좌표가 오면 통과시키지 않고 던진다', async () => {
    /*
     * 지워진 공급자가 만들던 방식 그대로 — 경유지 하나를 찍고 그 사이를 **선형
     * 보간**해 채운다. 이번엔 도로망 API가 이런 걸 줬다고 가정한다.
     *
     * 좌표를 손으로 아무렇게나 적으면 안 된다. 관문이 잡는 것은 지그재그가 아니라
     * 보간의 흔적(중간 점이 양옆을 잇는 직선 위에 정확히 놓임)이라, 손으로 적은
     * 꺾인 선은 진짜 길과 구분되지 않고 **통과하는 것이 맞다.**
     */
    const waypoint = { lat: 37.5142, lng: 126.9553 };
    const between = (a: typeof origin, b: typeof origin, t: number) => ({
      lat: a.lat + (b.lat - a.lat) * t,
      lng: a.lng + (b.lng - a.lng) * t,
    });
    const drawn = [
      origin,
      between(origin, waypoint, 0.6),
      waypoint,
      between(waypoint, destination, 0.4),
      destination,
    ];

    await expect(providerReturning(drawn).shortest(origin, destination)).rejects.toThrow();
  });

  it('빈 응답이 와도 "0분 0.0km"가 아니라 실패가 된다', async () => {
    /*
     * 예전엔 최단 경로에만 이 검사가 없었다. 200과 함께 빈 본문이 오면 점 0개짜리
     * 경로가 예외 없이 통과해, 정직한 실패 문구를 건너뛴 채 지도도 없는
     * "0분 · 0.0km"가 화면에 남았다.
     */
    await expect(providerReturning([]).shortest(origin, destination)).rejects.toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import { deriveFeatures, noveltyOf } from '../features';
import { toStreetSegments } from '../tmap/parse';
import { EMPTY_ENVIRONMENT } from '../environment';
import type { Building } from '../buildings/types';
import type { LatLng } from '../../domain/types';

const SEOUL: LatLng = { lat: 37.5665, lng: 126.978 };

/** 남북으로 곧게 뻗은 1km 경로. */
const PATH: LatLng[] = [
  { lat: 37.5759, lng: 126.9769 },
  { lat: 37.5711, lng: 126.9774 },
  { lat: 37.5663, lng: 126.9779 },
];

/** 그늘을 계산하려면 건물 높이가 있어야 한다. 없으면 모르는 것으로 둔다. */
const BUILDINGS: Building[] = [
  { at: { lat: 37.5711, lng: 126.9765 }, floors: 8, heightM: 26 },
  { at: { lat: 37.5711, lng: 126.9783 }, floors: 8, heightM: 26 },
];

const WITH_BUILDINGS = { ...EMPTY_ENVIRONMENT, buildings: BUILDINGS };

function input(overrides: Partial<Parameters<typeof deriveFeatures>[0]> = {}) {
  return {
    distanceM: 1000,
    durationSec: 800,
    crossings: 0,
    stairs: 0,
    path: PATH,
    segments: toStreetSegments(PATH),
    origin: SEOUL,
    departAtMs: Date.UTC(2026, 7, 17, 3, 0),
    ...overrides,
  };
}

describe('deriveFeatures', () => {
  it('횡단보도가 없으면 생각이 안 끊긴다', () => {
    expect(deriveFeatures(input({ crossings: 0 })).unbroken).toBe(1);
  });

  it('횡단보도가 많을수록 unbroken이 떨어진다', () => {
    const few = deriveFeatures(input({ crossings: 2 })).unbroken;
    const many = deriveFeatures(input({ crossings: 6 })).unbroken;

    expect(many).toBeLessThan(few);
    expect(many).toBeGreaterThanOrEqual(0);
  });

  it('계단이 많을수록 flat이 떨어진다', () => {
    expect(deriveFeatures(input({ stairs: 4 })).flat).toBeLessThan(
      deriveFeatures(input({ stairs: 1 })).flat
    );
  });

  it('아무리 나빠도 0~1 밖으로 나가지 않는다', () => {
    const extreme = deriveFeatures(input({ crossings: 500, stairs: 500 }));

    for (const value of Object.values(extreme)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('건물 높이가 있으면 그늘은 실제 경로 방위각으로 계산된다', () => {
    const noon = deriveFeatures(
      input({ departAtMs: Date.UTC(2026, 7, 17, 3, 0), environment: WITH_BUILDINGS })
    );
    const evening = deriveFeatures(
      input({ departAtMs: Date.UTC(2026, 7, 17, 9, 0), environment: WITH_BUILDINGS })
    );

    // 해가 낮아지는 저녁에 그늘이 더 많다
    expect(evening.shade).toBeGreaterThan(noon.shade);
  });

  it('건물 높이를 하나도 못 받으면 그늘은 중립값이다 — 지어내지 않는다', () => {
    // 기본 단면(양옆 15m)으로 계산하면 남북 길과 동서 길이 그럴듯하게 갈리는데,
    // 그 차이는 전부 지어낸 벽에서 나온다. 모르면 모른다고 해야 한다.
    const northSouth = deriveFeatures(input());
    const eastWest = deriveFeatures(
      input({
        path: [
          { lat: 37.5665, lng: 126.972 },
          { lat: 37.5665, lng: 126.978 },
          { lat: 37.5665, lng: 126.984 },
        ],
        segments: toStreetSegments([
          { lat: 37.5665, lng: 126.972 },
          { lat: 37.5665, lng: 126.978 },
          { lat: 37.5665, lng: 126.984 },
        ]),
      })
    );

    expect(northSouth.shade).toBe(0.5);
    expect(eastWest.shade).toBe(0.5);
  });

  it('아직 데이터가 없는 성질은 중립값이다', () => {
    const features = deriveFeatures(input());

    expect(features.quiet).toBe(0.5);
    expect(features.scenic).toBe(0.5);
  });
});

describe('noveltyOf', () => {
  it('기록이 없으면 전부 처음 걷는 길이다', () => {
    expect(noveltyOf(PATH, [])).toBe(1);
  });

  it('똑같은 길을 다시 걸으면 새롭지 않다', () => {
    expect(noveltyOf(PATH, [PATH])).toBe(0);
  });

  it('멀리 떨어진 기록은 영향을 주지 않는다', () => {
    const busan = [{ lat: 35.1796, lng: 129.0756 }];
    expect(noveltyOf(PATH, [busan])).toBe(1);
  });

  it('일부만 겹치면 그 비율만큼 줄어든다', () => {
    const partial = [[PATH[0]]];
    const novelty = noveltyOf(PATH, partial);

    expect(novelty).toBeGreaterThan(0);
    expect(novelty).toBeLessThan(1);
  });

  it('빈 경로에도 죽지 않는다', () => {
    expect(noveltyOf([], [PATH])).toBe(1);
  });
});

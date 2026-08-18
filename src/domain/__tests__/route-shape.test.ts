import { describe, expect, it } from 'vitest';
import { VIEWBOX, projectPath, toSvgPath } from '../../ui/routeShape';

describe('projectPath', () => {
  it('빈 경로는 빈 배열', () => {
    expect(projectPath([])).toEqual([]);
  });

  it('여백 안에 담긴다', () => {
    const points = projectPath([
      { lat: 37.5, lng: 127.0 },
      { lat: 37.6, lng: 127.1 },
      { lat: 37.55, lng: 127.02 },
    ]);

    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(10);
      expect(p.x).toBeLessThanOrEqual(VIEWBOX - 10);
      expect(p.y).toBeGreaterThanOrEqual(10);
      expect(p.y).toBeLessThanOrEqual(VIEWBOX - 10);
    }
  });

  it('북쪽 점이 화면 위로 간다 — y를 뒤집지 않으면 남북이 거꾸로 그려진다', () => {
    const [south, north] = projectPath([
      { lat: 37.5, lng: 127.0 },
      { lat: 37.6, lng: 127.0 },
    ]);
    expect(north.y).toBeLessThan(south.y);
  });

  it('가로세로 비율을 유지한다 — 남북 직선과 동서 직선이 같은 모양이 되면 안 된다', () => {
    // 위도로만 뻗은 길: x는 한 점에 모이고 y가 벌어진다.
    const vertical = projectPath([
      { lat: 37.5, lng: 127.0 },
      { lat: 37.6, lng: 127.0 },
    ]);
    expect(vertical[0].x).toBeCloseTo(vertical[1].x, 5);
    expect(Math.abs(vertical[0].y - vertical[1].y)).toBeCloseTo(80, 5);

    // 경도로만 뻗은 길: 정확히 그 반대여야 한다.
    const horizontal = projectPath([
      { lat: 37.5, lng: 127.0 },
      { lat: 37.5, lng: 127.1 },
    ]);
    expect(horizontal[0].y).toBeCloseTo(horizontal[1].y, 5);
    expect(Math.abs(horizontal[0].x - horizontal[1].x)).toBeCloseTo(80, 5);
  });

  it('짧은 축은 가운데로 정렬한다', () => {
    // 경도로 길고 위도로 짧은 경로 — y는 가운데(50) 근처에 모인다.
    const points = projectPath([
      { lat: 37.5, lng: 127.0 },
      { lat: 37.51, lng: 127.1 },
    ]);
    const midY = (points[0].y + points[1].y) / 2;
    expect(midY).toBeCloseTo(50, 5);
  });

  it('모든 좌표가 같으면 가운데 한 점으로 둔다 (0으로 나누지 않는다)', () => {
    const same = { lat: 37.5, lng: 127.0 };
    const points = projectPath([same, same, same]);
    for (const p of points) {
      expect(p.x).toBeCloseTo(50, 5);
      expect(p.y).toBeCloseTo(50, 5);
      expect(Number.isFinite(p.x)).toBe(true);
    }
  });
});

describe('toSvgPath', () => {
  it('점이 하나뿐이면 그릴 선이 없다', () => {
    expect(toSvgPath([{ x: 1, y: 2 }])).toBe('');
    expect(toSvgPath([])).toBe('');
  });

  it('M으로 시작해 L로 잇는다', () => {
    expect(
      toSvgPath([
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ])
    ).toBe('M1.00 2.00 L3.00 4.00');
  });
});

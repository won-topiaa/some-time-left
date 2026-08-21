import { describe, expect, it } from 'vitest';
import { VIEWBOX, projectPath, splitAtRatio, toSvgPath } from '../../ui/routeShape';
import { distanceM } from '../geo';

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

describe('splitAtRatio', () => {
  const straight = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 20, y: 0 },
  ];

  it('점이 하나 이하면 나눌 게 없다', () => {
    expect(splitAtRatio([{ x: 0, y: 0 }], 0.5)).toBeNull();
  });

  it('한가운데면 절반씩', () => {
    const split = splitAtRatio(straight, 0.5);
    expect(split?.at).toEqual({ x: 10, y: 0 });
  });

  it('0과 1은 양 끝', () => {
    expect(splitAtRatio(straight, 0)?.at).toEqual({ x: 0, y: 0 });
    expect(splitAtRatio(straight, 1)?.at).toEqual({ x: 20, y: 0 });
  });

  it('범위를 벗어난 값은 끝으로 잘린다', () => {
    expect(splitAtRatio(straight, -1)?.at).toEqual({ x: 0, y: 0 });
    expect(splitAtRatio(straight, 2)?.at).toEqual({ x: 20, y: 0 });
  });

  it('걸어온 길과 남은 길이 지금 자리에서 맞닿는다', () => {
    const split = splitAtRatio(straight, 0.25);
    if (split == null) throw new Error('나뉘어야 한다');

    expect(split.walked[split.walked.length - 1]).toEqual(split.at);
    expect(split.ahead[0]).toEqual(split.at);
  });

  /*
   * 이 테스트가 있는 이유.
   *
   * 걷는 화면이 넘기는 비율은 **미터**로 잰 값인데, 그림 좌표는 위경도를 그대로
   * 눌러 담은 것이라 경도 쪽이 서울에서 0.8배쯤 눌려 있다. 자를 안 맞추면
   * 동서로 긴 구간에서 점이 실제 자리보다 앞뒤로 밀린다.
   */
  it('구간 길이를 주면 그 자로 잰다', () => {
    // 남북 1, 동서 1 — 도 단위로는 같은 길이지만 실제 거리는 동서가 짧다.
    const corner = [
      { lat: 37.5, lng: 127.0 },
      { lat: 37.51, lng: 127.0 },
      { lat: 37.51, lng: 127.01 },
    ];
    const points = projectPath(corner);
    const segmentM = corner.slice(1).map((point, i) => distanceM(corner[i], point));

    // 실제 거리로 딱 절반이면 모서리보다 앞이다 — 남북 구간이 더 길기 때문.
    const metric = splitAtRatio(points, 0.5, segmentM);
    const drawn = splitAtRatio(points, 0.5);
    if (metric == null || drawn == null) throw new Error('나뉘어야 한다');

    // 그림 위 길이로 재면 정확히 모서리에 찍힌다(두 구간이 도 단위로 같으므로).
    expect(drawn.at.x).toBeCloseTo(points[1].x, 6);
    expect(drawn.at.y).toBeCloseTo(points[1].y, 6);
    // 실제 거리로 재면 아직 모서리에 못 미친다 — 남북 구간을 다 걷기 전이다.
    // (y는 위로 갈수록 작아지므로, 덜 왔다는 건 y가 더 크다는 뜻이다.)
    expect(metric.at.y).toBeGreaterThan(points[1].y + 1);
    expect(metric.at.x).toBeCloseTo(points[1].x, 6);
  });

  it('구간 개수가 안 맞는 길이 배열은 무시한다', () => {
    expect(splitAtRatio(straight, 0.5, [1])?.at).toEqual({ x: 10, y: 0 });
  });
});

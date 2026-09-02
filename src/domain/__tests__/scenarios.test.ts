import { describe, expect, it } from 'vitest';
import {
  ARRIVE_EARLY_SEC,
  arrivalAt,
  departAt,
  formatClock,
  planWalk,
  resolveAppointment,
  waitSec,
} from '../time';
import { estimateSpeedMps, paceAdvice } from '../pace';
import { pathLengthM, projectToPath, splitPath, walkProgress } from '../geo';
import { arrivalPrompt, walkShareText } from '../copy';
import { NO_CARRIED, addToCarried, traceSummary } from '../trace';
import { dominantFeature, weightsFor } from '../mood';
import type { RouteFeatures, WalkRecord } from '../types';

/**
 * 한 화면이 아니라 **하루**를 따라가는 시험.
 *
 * 함수 하나하나는 제 시험이 있다. 여기는 그 함수들이 실제 상황에서 서로 맞물려
 * 무슨 말을 하게 되는지를 본다 — 약속이 코앞인 날, 너무 이른 날, 신호에 걸린 순간,
 * 길을 잘못 든 순간, 저장소가 넘친 날.
 */
const MIN = 60;

describe('계획 — 경계에서 무엇이라 말하는가', () => {
  const now = 0;
  const walk = 20 * MIN;

  it('약속까지가 최단과 똑같으면 늦은 게 아니라 "곧장 가요"', () => {
    const plan = planWalk({ nowMs: now, arriveAtMs: walk * 1000, shortestSec: walk });
    expect(plan).toEqual({ kind: 'straight', reason: 'no-early', targetWalkSec: walk });
  });

  it('1초 모자라면 1초 늦는다고 말한다', () => {
    const plan = planWalk({ nowMs: now, arriveAtMs: (walk - 1) * 1000, shortestSec: walk });
    expect(plan).toEqual({ kind: 'too-late', shortBySec: 1 });
  });

  it('여유 90초까지는 곧장, 91초부터 늘린다', () => {
    const at = (slack: number) => (walk + ARRIVE_EARLY_SEC + slack) * 1000;
    expect(planWalk({ nowMs: now, arriveAtMs: at(90), shortestSec: walk }).kind).toBe('straight');
    expect(planWalk({ nowMs: now, arriveAtMs: at(91), shortestSec: walk }).kind).toBe('stretch');
  });

  it('두 블록 거리(2분)에 한 시간이 남으면 4.4분에서 자른다', () => {
    const plan = planWalk({ nowMs: now, arriveAtMs: 60 * MIN * 1000, shortestSec: 120 });
    expect(plan).toMatchObject({ kind: 'stretch', capped: true, targetWalkSec: 264 });
  });

  it('약속이 이미 지났으면 too-late', () => {
    expect(planWalk({ nowMs: 10_000, arriveAtMs: 0, shortestSec: 60 }).kind).toBe('too-late');
  });

  it('출발과 도착이 같아도(최단 0초) 0으로 나누지 않는다', () => {
    const plan = planWalk({ nowMs: now, arriveAtMs: 30 * MIN * 1000, shortestSec: 0 });
    expect(plan).toMatchObject({ kind: 'stretch', capped: true, targetWalkSec: 0 });
  });
});

describe('나설 시각 — 너무 이른 날', () => {
  it('87분 남았는데 44분 길이면 38분 뒤에 나서라 하고, 그때 나서면 정확히 5분 전', () => {
    const now = 1_700_000_000_000;
    const arrive = now + 87 * MIN * 1000;
    const leave = departAt(arrive, 44 * MIN, now);
    expect(leave).not.toBeNull();
    expect(waitSec(leave, now)).toBe(38 * MIN);
    expect(arrivalAt(leave!, 44 * MIN)).toBe(arrive - ARRIVE_EARLY_SEC * 1000);
  });

  it('30초만 이르면 시각은 나오지만 화면 문턱(60초) 아래다', () => {
    const now = 0;
    const leave = departAt(now + (ARRIVE_EARLY_SEC + 600 + 30) * 1000, 600, now);
    expect(waitSec(leave, now)).toBe(30);
  });
});

describe('적은 시각 — 오후 2시에 적으면', () => {
  const now = Date.UTC(2026, 8, 2, 5, 0); // 2026-09-02 14:00 KST

  it('"6:30"은 오늘 저녁 6시 반', () => {
    const at = resolveAppointment({ hour12: 6, minute: 30, period: null }, now)!;
    expect(formatClock(at)).toBe('오후 6시 30분');
    expect(at - now).toBe((4 * 60 + 30) * MIN * 1000);
  });

  it('"1:00"은 오늘 오후 1시가 지났으니 내일 새벽 1시', () => {
    const at = resolveAppointment({ hour12: 1, minute: 0, period: null }, now)!;
    expect(formatClock(at)).toBe('오전 1시');
    expect(at).toBeGreaterThan(now);
  });

  it('"14:00"은 지금과 같으니 내일', () => {
    const at = resolveAppointment({ hour12: 14, minute: 0, period: null }, now)!;
    expect(at - now).toBe(24 * 60 * MIN * 1000);
  });

  it('오전 12:30은 자정 반', () => {
    const at = resolveAppointment({ hour12: 12, minute: 30, period: 'am' }, now)!;
    expect(formatClock(at)).toBe('오전 12시 30분');
  });

  it('분 60·시 24·숫자 아님은 null — 다음 버튼이 잠긴다', () => {
    expect(resolveAppointment({ hour12: 6, minute: 60, period: null }, now)).toBeNull();
    expect(resolveAppointment({ hour12: 24, minute: 0, period: null }, now)).toBeNull();
    expect(resolveAppointment({ hour12: NaN, minute: 0, period: null }, now)).toBeNull();
  });
});

describe('걷는 동안 — 페이스', () => {
  it('목표 시각이 지났는데 아직 500m 남았으면 서두르라 하되 예측 시각은 유한하다', () => {
    const advice = paceAdvice({ remainingM: 500, remainingSec: 0, currentSpeedMps: 1.2 });
    expect(advice.action).toBe('hurry');
    expect(Number.isFinite(advice.predictedSec)).toBe(true);
  });

  it('다 왔으면(0m) 어떤 속도든 재촉하지 않는다', () => {
    const advice = paceAdvice({ remainingM: 0, remainingSec: 300, currentSpeedMps: 0 });
    expect(advice.predictedSec).toBe(0);
    expect(advice.action).toBe('slower');
  });

  it('신호에 걸려 서 있으면(0.1m/s) 평균 속도로 예측한다', () => {
    const advice = paceAdvice({ remainingM: 1250, remainingSec: 1000, currentSpeedMps: 0.1 });
    expect(advice.predictedSec).toBe(1000);
    expect(advice.action).toBe('keep');
  });

  it('출발 직후 표본이 둘뿐이면 튀어도(30m/s) 기본 속도', () => {
    const sample = { distanceFromPrevM: 90, elapsedSec: 3 };
    expect(estimateSpeedMps([sample, sample])).toBe(1.25);
  });

  it('다섯 중 하나가 튀어도 중앙값', () => {
    const samples = [4, 4, 90, 4, 4].map((d) => ({ distanceFromPrevM: d, elapsedSec: 3 }));
    expect(estimateSpeedMps(samples)).toBeCloseTo(4 / 3);
  });

  it('같은 시각의 중복 표본(elapsed 0)은 버린다 — Infinity 없음', () => {
    const samples = [
      { distanceFromPrevM: 5, elapsedSec: 0 },
      ...[4, 4, 4].map((d) => ({ distanceFromPrevM: d, elapsedSec: 3 })),
    ];
    expect(Number.isFinite(estimateSpeedMps(samples))).toBe(true);
  });
});

describe('걷는 동안 — 위치', () => {
  const start = { lat: 37.5665, lng: 126.978 };
  const at = (n: number, e: number) => ({
    lat: start.lat + n / 111320,
    lng: start.lng + e / (111320 * Math.cos((start.lat * Math.PI) / 180)),
  });
  // ㄱ자 900m: 북 300, 동 300, 북 300.
  const path = [at(0, 0), at(300, 0), at(300, 300), at(600, 300)];

  it('길에서 100m 벗어나면 벗어난 거리가 따로 보이고 남은 거리에도 더해진다', () => {
    const now = walkProgress(path, at(150, 100), { since: 0 });
    expect(now.offPathM).toBeCloseTo(100, 0);
    expect(Math.abs(now.remainingM - (100 + 750))).toBeLessThan(2);
  });

  it('첫 측정이 도착점이면 바로 40m 안쪽 — 자동 도착', () => {
    expect(walkProgress(path, at(600, 300), {}).remainingM).toBeLessThan(1);
  });

  it('도착(진행 1.0) 뒤 100m 되돌아가도 남은 거리는 되돌아간 만큼이다', () => {
    const back = walkProgress(path, at(500, 300), { since: 1 });
    expect(back.remainingM).toBeCloseTo(100, 0);
    expect(back.alongRatio).toBeCloseTo(1, 5);
  });

  it('두 표본이 같은 자리(maxAdvance 0)면 진행이 멈출 뿐 NaN이 아니다', () => {
    const now = walkProgress(path, at(150, 0), { since: 0.1, maxAdvanceM: 0 });
    expect(now.alongRatio).toBeCloseTo(0.1);
    expect(Number.isFinite(now.remainingM)).toBe(true);
  });

  it('다 걸은 길을 나누면 걸은 쪽이 길 전체다', () => {
    expect(splitPath(path, 1)!.walked).toHaveLength(4);
    expect(pathLengthM(splitPath(path, 1)!.walked)).toBeCloseTo(pathLengthM(path), 6);
  });

  it('점 하나짜리 경로에도 투영된다', () => {
    expect(projectToPath([start], at(10, 0)).distanceM).toBeCloseTo(10, 0);
  });
});

describe('도착 — 남기고 보내는 말', () => {
  it('공유 문장: 이름도 동행도 없으면 "어딘가"', () => {
    expect(
      walkShareText({ destinationName: '', companion: '', mood: 'plain', note: '' }, 1234)
    ).toBe('어딘가까지 1.23km 걸었어요.\n\n— 자투리 시간 · 그냥 그래요 걸었던 날');
  });

  it('공유 문장: 동행과 한 줄이 있으면 그 줄이 가운데 온다', () => {
    const text = walkShareText(
      { destinationName: '성수', companion: '민지', mood: 'excited', note: ' 좋았다 ' },
      0
    );
    expect(text.split('\n')).toEqual([
      '민지 만나러 성수까지, 0.00km 걸었어요.',
      '',
      '"좋았다"',
      '',
      '— 자투리 시간 · 설레요 걸었던 날',
    ]);
  });

  it('동행이 공백뿐이면 없는 것', () => {
    expect(arrivalPrompt('  ')).toContain('첫 마디');
  });
});

describe('지나온 길 — 넘친 날', () => {
  const record = (i: number): WalkRecord => ({
    id: `${i}`,
    companion: '',
    mood: 'plain',
    note: i % 2 === 1 ? '한 줄' : '',
    arrivedAt: i,
    destinationName: 'a',
    path: [],
    routeId: 'r',
    distanceM: 100,
  });

  it('밀려난 둘 + 남은 하나 = 세 번, 300m, 한 줄 둘', () => {
    const carried = addToCarried(NO_CARRIED, [record(1), record(2)]);
    expect(traceSummary([record(3)], carried)).toEqual({
      count: 3,
      totalDistanceM: 300,
      noteCount: 2,
      firstAt: 3,
    });
  });
});

describe('이유 한 줄 — 데이터가 없는 날', () => {
  const neutral: RouteFeatures = { quiet: 0.5, flat: 0.5, shade: 0.5, scenic: 0.5, novelty: 0.5, unbroken: 0.5 };

  it('전부 중립이면 두드러진 게 없어 가중치가 큰 성질로 물러선다 (알려진 한계)', () => {
    // 건물 데이터가 없어도 '햇볕이 싫어요'에는 그늘이 이유가 된다.
    // NOTABLE 문턱은 다른 성질이 하나라도 재졌을 때만 이 말을 막는다.
    expect(dominantFeature(neutral, weightsFor('hot'))).toBe('shade');
  });

  it('하나라도 두드러지면 모르는 성질은 이유가 되지 않는다', () => {
    expect(dominantFeature({ ...neutral, novelty: 0.7 }, weightsFor('hot'))).toBe('novelty');
  });
});

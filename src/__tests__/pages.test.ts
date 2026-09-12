/**
 * 화면 파일과 라우터 사이의 약속을 지킨다.
 *
 * granite 라우터는 `/_404`가 없으면 첫 렌더에서 던지고, 그 던짐은 `_app.tsx`의
 * ErrorBoundary보다 위에서 일어나 **흰 화면만** 남긴다(오류 문구조차 안 나온다).
 * 실기기에 올려 보기 전에는 알 수 없는 종류의 실패라 여기서 막는다.
 *
 * 경로 타입(`src/types/router.d.ts`)도 같이 본다. 이 둘이 어긋나면 화면은
 * 뜨는데 `navigation.navigate`가 타입 오류로 막히거나, 반대로 없는 화면으로
 * 보내는 코드가 통과한다.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const PAGES_DIR = path.join(__dirname, '..', 'pages');
const ROUTER_TYPES = path.join(__dirname, '..', 'types', 'router.d.ts');

/** `_404.tsx` → `/_404`, `index.tsx` → `/`. 라우터의 getRoutePath와 같은 규칙. */
function routePath(fileName: string): string {
  const base = fileName.replace(/\.(tsx|ts)$/, '');
  return base === 'index' ? '/' : `/${base}`;
}

const pageFiles = readdirSync(PAGES_DIR).filter((name) => /\.tsx?$/.test(name));
const pagePaths = pageFiles.map(routePath);

describe('pages 디렉터리', () => {
  it('_404 화면이 있다', () => {
    expect(pagePaths).toContain('/_404');
  });

  it('각 파일이 자기 파일명과 같은 경로로 createRoute를 부른다', () => {
    for (const file of pageFiles) {
      const source = readFileSync(path.join(PAGES_DIR, file), 'utf8');
      expect(source, `${file}에 createRoute가 없다`).toContain(
        `createRoute('${routePath(file)}'`
      );
    }
  });

  it('경로 타입 선언이 화면 목록과 일치한다', () => {
    const declared = [...readFileSync(ROUTER_TYPES, 'utf8').matchAll(/'(\/[^']*)':/g)].map(
      (match) => match[1]
    );
    expect(declared.sort()).toEqual(pagePaths.sort());
  });
});

/**
 * 프레임워크가 이미 감싼 것을 또 감싸지 않는다.
 *
 * `AppRoot`가 Router 위에서 SafeAreaProvider를 하나 두는데, `boot.tsx`에서 하나 더
 * 두면 두 겹이 된다. 안쪽 provider가 자기 크기를 재서 setState하고 그 결과가 자기
 * 레이아웃을 바꾸는 되먹임이 생겨, 실기기에서 무한 루프로 나타났다 —
 * "Maximum update depth exceeded"가 화면마다 초당 수십 줄씩 찍혔다.
 *
 * 눈으로는 안 보이고 로그로만 보이는 종류라 다시 들어오기 쉽다. 여기서 막는다.
 */
describe('boot.tsx', () => {
  const BOOT = readFileSync(path.join(__dirname, '..', 'boot.tsx'), 'utf8');

  it('SafeAreaProvider를 다시 감싸지 않는다', () => {
    // 주석에서는 이름을 말해도 되지만, 실제로 그리지는 않아야 한다.
    expect(BOOT).not.toMatch(/<SafeAreaProvider/);
  });
});

/**
 * 걷는 화면의 위치 확신 배선.
 *
 * `positionCertainty`는 순수 함수라 따로 시험하지만, 이 화면이 **무엇을 넣어
 * 주는지**는 그 테스트로 잡히지 않는다. 실제로 두 번 다 여기서 틀렸다.
 *
 * 하나. 첫 측정을 기다려 주는 유예를 '걷기 시작한 시각'으로 재고 있었다. 위치
 * 구독은 화면이 가려지면 끊고 다시 보이면 새로 거는데, 도착 화면에서 한 줄을
 * 적다 3분 뒤에 돌아오면 유예가 이미 다 지나 있어서 **첫 프레임부터**
 * "지금 위치가 잡히지 않아요"가 떴다. 서 있어도, 움직여도, GPS가 멀쩡해도.
 *
 * 둘. 오류 표시를 측정이 들어올 때만 풀었다. 서 있는 동안에는 측정이 안 오므로
 * (5m를 안 움직였으니까) 한 번 튄 오류가 스스로 풀릴 기회가 없었다.
 *
 * 둘 다 화면 렌더러 없이는 재현이 안 되고 이 저장소에는 그 렌더러가 없다.
 * 그래서 약속을 소스에 못으로 박는다 — 배선을 바꿀 거라면 이 못도 같이 옮기되,
 * 위의 두 가지가 여전히 성립하는지 먼저 확인해야 한다.
 */
describe('walk.tsx — 위치 확신 배선', () => {
  const source = readFileSync(path.join(PAGES_DIR, 'walk.tsx'), 'utf8');

  /** `from`이 나오는 곳부터 `to`가 나오는 곳까지. */
  function between(from: string, to: string): string {
    const start = source.indexOf(from);
    expect(start, `${from}을 못 찾았다`).toBeGreaterThan(-1);
    const end = source.indexOf(to, start);
    expect(end, `${to}를 못 찾았다`).toBeGreaterThan(start);
    return source.slice(start, end);
  }

  const onFocus = between("addListener('focus'", "addListener('blur'");

  it('유예를 구독이 시작된 시각으로 잰다', () => {
    // 주석은 뺀다 — 왜 startedAtMs가 아닌지 적어 둔 주석이 이 못에 걸리면
    // 설명을 지우는 쪽으로 고치게 된다.
    const call = between('positionCertainty({', '});').replace(/\/\/.*/g, '');
    expect(call).toContain('sinceListeningMs');
    // 걷기 시작한 시각으로 재면 돌아온 사람에게 유예가 없다.
    expect(call).not.toContain('startedAtMs');
  });

  it('다시 보일 때 마지막 측정 시각을 비운다', () => {
    expect(onFocus).toContain('lastFixAtMs.current = null');
  });

  it('마지막 측정 시각을 비우면서 기다리는 시계도 같이 옮긴다', () => {
    // 하나만 하면 오히려 나빠진다. 측정만 비우고 시계를 그대로 두면
    // hadFix는 false인데 유예는 이미 지나 있어 곧장 'lost'다.
    expect(onFocus).toMatch(/listeningSinceMs\.current = /);
  });

  it('다시 보일 때 오류 표시도 푼다', () => {
    expect(onFocus).toMatch(/setLostAtMs\(null\)/);
  });

  it('길로 돌아온 것은 위치를 모르는 동안에도 셈한다', () => {
    // 해제가 blind 뒤에 있으면, 눈을 감은 사이에 돌아온 사람은 경고가 안 풀려
    // 다음에 또 벗어나도 알림을 못 받는다.
    const effect = between('const warnedOffRoute', '}, [offRouteM, blind]);');
    expect(effect.indexOf('warnedOffRoute.current = false')).toBeLessThan(
      effect.indexOf('|| blind')
    );
  });

  it('서 있는 사람에게는 "이 속도면"이라고 하지 않는다', () => {
    // 조용한 동안 speedMps는 마지막으로 걷던 속도에 얼어 있다. 같은 숫자라도
    // "걷기 시작하면"이라고 말하면 참이 된다.
    expect(source).toContain("standing ? '걷기 시작하면' : '이 속도면'");
  });
});

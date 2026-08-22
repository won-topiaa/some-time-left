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

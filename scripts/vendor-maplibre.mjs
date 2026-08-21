/**
 * MapLibre GL JS를 번들에 넣을 문자열로 만든다.
 *
 * 왜 CDN에서 안 받고 넣는가: 걷는 화면은 길 위에서 열린다. 거기서 1MB짜리
 * 자바스크립트를 내려받기 시작하면 지도가 몇 초 뒤에 뜬다. 그리고 무료 CDN 하나가
 * 더 늘어나는 건, 조건이 깨끗한 지도로 옮기면서 얻으려던 것과 반대다.
 *
 * 문자열이라 앱이 시작할 때 이걸 코드로 읽지 않는다 — 웹뷰에 넘길 때까지는
 * 그냥 데이터다. 늘어나는 건 번들 크기지 시작 시간이 아니다.
 *
 * 손으로 붙여넣지 않고 스크립트로 만든다. 어느 버전인지, 어디서 왔는지가
 * 남아야 나중에 올릴 수 있다.
 *
 *   npm i -D maplibre-gl && node scripts/vendor-maplibre.mjs
 */

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/*
 * maplibre-gl은 **의존성으로 두지 않는다.** 결과물(src/ui/vendor/maplibre.ts)이
 * 커밋되어 있으므로 앱을 받는 사람은 이걸 내려받을 이유가 없다. 올릴 때만 잠깐 깐다.
 */
let pkg;
let distDir;
try {
  pkg = require('maplibre-gl/package.json');
  distDir = path.dirname(require.resolve('maplibre-gl/package.json'));
} catch {
  console.error('maplibre-gl이 없어요. 올릴 때만 잠깐 깝니다:\n');
  console.error('  npm i -D maplibre-gl@5');
  console.error('  node scripts/vendor-maplibre.mjs');
  console.error('  npm remove maplibre-gl\n');
  process.exit(1);
}

/**
 * UMD 한 덩어리를 쓴다. 6.x는 ESM 여러 조각으로 쪼개져서 `<script>` 하나로 못 넣고,
 * csp 빌드는 워커가 따로라 파일이 둘이 된다. 5.x의 이 파일은 워커까지 안에 있다.
 */
const source = readFileSync(path.join(distDir, 'dist', 'maplibre-gl.js'), 'utf8');
const css = readFileSync(path.join(distDir, 'dist', 'maplibre-gl.css'), 'utf8');
const license = readFileSync(path.join(distDir, 'LICENSE.txt'), 'utf8');

/**
 * 템플릿 리터럴이 아니라 JSON 문자열로 쓴다.
 * 압축된 코드 안의 백틱과 `${`가 템플릿을 깨뜨린다.
 */
const out = `/**
 * MapLibre GL JS ${pkg.version} — **생성된 파일. 손으로 고치지 않는다.**
 *
 *   node scripts/vendor-maplibre.mjs
 *
 * 라이선스: ${pkg.license} (maplibre-gl). 전문은 아래 LICENSE에 그대로 담았고,
 * 웹뷰가 읽는 HTML 주석으로도 함께 나간다.
 */

/* eslint-disable */

/** dist/maplibre-gl.js (UMD 한 덩어리, 워커 포함) */
export const MAPLIBRE_JS = ${JSON.stringify(source)};

/** dist/maplibre-gl.css */
export const MAPLIBRE_CSS = ${JSON.stringify(css)};

/** 버전. 화면이 아니라 사람이 보려고 둔다 — 올릴 때 무엇이 바뀌는지 알아야 한다. */
export const MAPLIBRE_VERSION = ${JSON.stringify(pkg.version)};

/** dist/LICENSE.txt 전문 */
export const MAPLIBRE_LICENSE = ${JSON.stringify(license)};
`;

const target = path.join(root, 'src', 'ui', 'vendor', 'maplibre.ts');
writeFileSync(target, out);

const mb = (n) => `${(n / 1024 / 1024).toFixed(2)}MB`;
console.log(`maplibre-gl ${pkg.version} → src/ui/vendor/maplibre.ts`);
console.log(`  js  ${mb(source.length)}`);
console.log(`  css ${mb(css.length)}`);
console.log(`  파일 ${mb(out.length)}`);

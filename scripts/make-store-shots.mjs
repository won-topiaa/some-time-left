#!/usr/bin/env node
/**
 * 앱인토스 콘솔 '노출 정보'에 올릴 스크린샷을 만든다.
 *
 *   node --experimental-strip-types scripts/make-store-shots.mjs
 *   (npm run store-shots)
 *
 * 콘솔이 요구하는 크기 그대로 낸다.
 *   세로형 636x1048 — 최소 3장
 *   가로형 1504x741 — 최소 1장
 *
 * 화면을 손으로 다시 그리지 않는다. 색·간격·글자 크기·문구를 **앱이 쓰는 것을
 * 그대로 import** 한다(`src/ui/theme.ts`, `src/domain/copy.ts`, `src/domain/mood.ts`).
 * 스토어 이미지가 실제 앱과 어긋나는 건 대개 이걸 손으로 옮겨 적어서 생긴다 —
 * 토큰을 바꾸면 여기도 같이 바뀌어야 하고, 그러려면 같은 파일을 봐야 한다.
 *
 * 실제 기기 캡처가 아니라 **같은 토큰으로 그린 재현**이다. 화면에 없는 것을
 * 지어내지 않는 것이 유일한 규칙이다 — 여기 보이는 문구는 전부 앱에 있는 문구다.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { colors, radius, spacing, type } from '../src/ui/theme.ts';
import { MOOD_TINT } from '../src/ui/moodTint.ts';
import { MOODS } from '../src/domain/mood.ts';
import { NOTE_PLACEHOLDER, arrivalPrompt } from '../src/domain/copy.ts';
import { ARRIVE_EARLY_SEC, dayLabel, formatClock, formatDuration } from '../src/domain/time.ts';
import { formatTotalDistance } from '../src/domain/trace.ts';
import { VIEWBOX, projectPath, toSvgPath } from '../src/ui/routeShape.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'assets', 'store');

/** 콘솔에 적힌 크기. 여기서만 고친다. */
const PORTRAIT = { width: 636, height: 1048 };
const LANDSCAPE = { width: 1504, height: 741 };

/** 세로 캔버스 안에 얹는 기기. 실제 폰 비율(390x844)을 지킨다. */
const PHONE = { width: 372, height: 805, scale: 372 / 390 };

/* ------------------------------------------------------------------ *
 * 화면에 채울 값
 *
 * 지어낸 문구는 없다. 아래 문자열은 전부 `src/pages/`와 `src/domain/copy.ts`에
 * 있는 것이고, 좌표만 그럴듯한 산책로 모양으로 만들었다.
 * ------------------------------------------------------------------ */

/**
 * 좌표 몇 개를 부드러운 산책로로 늘린다. Catmull-Rom.
 *
 * 꺾인 다섯 점은 지그재그로 읽히지만, 실제 TMAP 보행 경로는 점이 촘촘해서
 * 흐르듯 굽는다. 화면에 나오는 모양을 실제와 다르게 보이지 않으려고 늘린다.
 */
function smooth(points, steps = 10) {
  const p = [points[0], ...points, points[points.length - 1]];
  const out = [];
  for (let i = 0; i < p.length - 3; i += 1) {
    const [a, b, c, d] = [p[i], p[i + 1], p[i + 2], p[i + 3]];
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const at = (k) =>
        0.5 *
        (2 * b[k] +
          (-a[k] + c[k]) * t +
          (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t2 +
          (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * t3);
      out.push({ lat: at(0), lng: at(1) });
    }
  }
  const last = points[points.length - 1];
  out.push({ lat: last[0], lng: last[1] });
  return out;
}

/**
 * 추천된 길 하나.
 *
 * 출발과 도착이 다른 곳이어야 한다 — 시작점으로 돌아오는 좌표를 주면
 * 화면에 동그라미가 그려지고, 그건 산책로가 아니라 올가미로 읽힌다.
 * 이 앱이 만드는 길은 최단 경로를 두고 **일부러 돌아가는** 길이라
 * 한 번 크게 휘었다가 목적지로 올라온다.
 */
const WALK_PATH = smooth([
  [37.5402, 127.0405],
  [37.5399, 127.0428],
  [37.5408, 127.0447],
  [37.5424, 127.0451],
  [37.5436, 127.0438],
  [37.5442, 127.0419],
  [37.5455, 127.0412],
  [37.5468, 127.0424],
  [37.5472, 127.0446],
]);

/** 기록에 남은 길들. 서로 다른 모양이어야 격자가 무늬로 읽힌다. */
const RECORD_PATHS = [
  [[37.55, 127.03], [37.5518, 127.0332], [37.5507, 127.0371], [37.5479, 127.0388], [37.5461, 127.0421], [37.5472, 127.0452]],
  [[37.561, 126.998], [37.5632, 126.9996], [37.5629, 127.0035], [37.5605, 127.0056], [37.5614, 127.0089], [37.5641, 127.0101]],
  [[37.526, 127.028], [37.5283, 127.0272], [37.5301, 127.0296], [37.5292, 127.0331], [37.5307, 127.0359], [37.5334, 127.0352]],
  [[37.5083, 127.06], [37.5106, 127.062], [37.5128, 127.0606], [37.5147, 127.0634], [37.5139, 127.0668], [37.5158, 127.0692]],
  [[37.573, 126.977], [37.5749, 126.9799], [37.5726, 126.9827], [37.5741, 126.9859], [37.5771, 126.9851], [37.5788, 126.9878]],
  [[37.5401, 127.07], [37.5427, 127.0711], [37.5441, 127.0682], [37.547, 127.0691], [37.5483, 127.0723], [37.5509, 127.0716]],
].map((p) => smooth(p, 8));

/**
 * 화면에 뜨는 시각·거리는 손으로 적지 않는다.
 *
 * "6:30 약속"이라고 적어 뒀다가 실제 앱이 `formatClock`으로 "오후 6시 30분"을
 * 그리는 걸 뒤늦게 봤다. 스토어 이미지가 앱과 어긋나는 건 늘 이런 자리다 —
 * 앱이 쓰는 함수를 그대로 부르면 어긋날 수가 없다.
 */
const APPOINTMENT_MS = Date.UTC(2026, 7, 20, 9, 30); // 한국 시간 오후 6시 30분
const NOW_MS = Date.UTC(2026, 7, 20, 6, 0); // 한국 시간 오후 3시

const RECORDS = [
  { path: RECORD_PATHS[0], mood: 'pensive', title: '서울숲', meta: '8월 18일 · 지우 · 생각이 많아요', note: '오랜만에 만나는 거라 무슨 말부터 할지 계속 골랐다.' },
  { path: RECORD_PATHS[1], mood: 'excited', title: '연희동', meta: '8월 14일 · 설레요', note: '' },
  { path: RECORD_PATHS[2], mood: 'hot', title: '선릉', meta: '8월 9일 · 준 · 햇볕이 싫어요', note: '그늘만 골라 걸었더니 생각보다 안 더웠다.' },
  { path: RECORD_PATHS[3], mood: 'tired', title: '잠실나루', meta: '8월 3일 · 지쳤어요', note: '' },
];

/* ------------------------------------------------------------------ *
 * 토큰 → CSS
 * ------------------------------------------------------------------ */

/** `type.body` 같은 토큰을 그대로 CSS로. 손으로 옮겨 적지 않으려고 둔다. */
function font(token, overrides = {}) {
  const t = { ...token, ...overrides };
  return [
    `font-size:${t.fontSize}px`,
    `line-height:${t.lineHeight}px`,
    `font-weight:${t.fontWeight}`,
    t.letterSpacing != null ? `letter-spacing:${t.letterSpacing}px` : '',
  ]
    .filter(Boolean)
    .join(';');
}

/** 경로 리본. 앱의 `RoutePreview`와 같은 투영·같은 규칙(출발은 비고 도착은 참). */
function ribbon(pathPoints, tint, { padding = 10, stroke = 2.5, endR = 4, startR = 3 } = {}) {
  const pts = projectPath(pathPoints, padding);
  return `<svg viewBox="0 0 ${VIEWBOX} ${VIEWBOX}" width="100%" height="100%">
    <path d="${toSvgPath(pts)}" stroke="${tint}" stroke-width="${stroke}" fill="none"
          stroke-linecap="round" stroke-linejoin="round"/>
    ${startR > 0 ? `<circle cx="${pts[0].x}" cy="${pts[0].y}" r="${startR}" fill="${colors.surface}" stroke="${colors.inkGhost}" stroke-width="1.5"/>` : ''}
    <circle cx="${pts[pts.length - 1].x}" cy="${pts[pts.length - 1].y}" r="${endR}" fill="${tint}"/>
  </svg>`;
}

/** 기록 한 칸의 작은 리본. 앱의 `RouteGlyph`와 같은 값(여백 14, 굵기 5). */
function glyph(pathPoints, tint, size = 64) {
  return `<div style="width:${size}px;height:${size}px;flex:none">
    ${ribbon(pathPoints, tint, { padding: 14, stroke: 5, endR: 6, startR: 0 })}
  </div>`;
}

/* ------------------------------------------------------------------ *
 * 화면 여섯 개
 *
 * 각 함수는 폰 안쪽(390x844)에 들어갈 마크업만 낸다.
 * ------------------------------------------------------------------ */

const PAD = spacing.lg;
/** 토스 내비게이션 바가 내용 위에 뜬다(높이 44). 앱의 `useScreenInsets`와 같은 값. */
const TOP = 59 + 44 + spacing.sm;
const BOTTOM = 34 + spacing.lg;

/**
 * 토스 내비게이션 바.
 *
 * `transparentBackground: true`라 바탕 없이 내용 **위에** 뜬다(높이 44).
 * 그리지 않으면 화면 위쪽 여백이 그냥 빈 자리로 보이는데, 실제로는 여기에
 * 이 줄이 얹힌다 — 스토어 이미지가 앱과 달라 보이는 자리가 된다.
 */
const navBar = (back) => `<div style="position:absolute;top:59px;left:0;right:0;height:44px;
    display:flex;align-items:center;padding:0 ${spacing.md}px;box-sizing:border-box">
  ${back ? `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke="${colors.ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ''}
</div>`;

const screen = (inner, { style = '', back = true, fade = false } = {}) =>
  `<div style="position:relative;width:390px;height:844px;background:${colors.bg};overflow:hidden">
    <div style="width:100%;height:100%;padding:${TOP}px ${PAD}px ${BOTTOM}px;box-sizing:border-box;
        display:flex;flex-direction:column;overflow:hidden;${style}">${inner}</div>
    ${navBar(back)}
    ${fade ? `<div style="position:absolute;left:0;right:0;bottom:0;height:120px;
        background:linear-gradient(to bottom, rgba(250,249,246,0), ${colors.bg})"></div>` : ''}
  </div>`;

function home() {
  return screen(`
    <div style="margin-bottom:${spacing.xl}px">
      <!-- 편지의 첫 줄. 가장 작고 가장 옅게. -->
      <div style="${font(type.caption)};color:${colors.inkFaint};margin-bottom:${spacing.sm}px">지금 28도, 맑아요</div>
      <div style="${font(type.display)};color:${colors.ink}">시간이 좀 남았네요.</div>
      <div style="${font(type.body)};color:${colors.inkSoft};margin-top:${spacing.sm}px">약속 3분 전에 도착하게 해드릴게요.</div>
    </div>

    <div style="${font(type.caption)};color:${colors.inkSoft};margin-bottom:${spacing.sm}px">어디로 가세요?</div>
    <div style="background:${colors.surface};border-radius:${radius.md}px;
        padding:${spacing.md}px;margin-bottom:${spacing.lg}px;display:flex;
        align-items:center;justify-content:space-between">
      <span style="${font(type.body)};color:${colors.ink}">성수역 3번 출구</span>
      <span style="${font(type.caption)};color:${colors.accent}">변경</span>
    </div>

    <div style="${font(type.caption)};color:${colors.inkSoft};margin-bottom:${spacing.sm}px">몇 시 약속이에요?</div>
    <div style="display:flex;align-items:center;gap:${spacing.md}px">
      <div style="display:flex;gap:${spacing.sm}px">
        <div style="padding:${spacing.sm + 2}px ${spacing.md}px;border-radius:${radius.pill}px;
            background:${colors.surface};${font(type.body)};color:${colors.inkSoft}">오전</div>
        <div style="padding:${spacing.sm + 2}px ${spacing.md}px;border-radius:${radius.pill}px;
            background:${colors.ink};${font(type.body)};color:${colors.surface};font-weight:600">오후</div>
      </div>
      <div style="display:flex;align-items:center;background:${colors.surface};
          border-radius:${radius.md}px;padding:0 ${spacing.sm}px">
        <div style="${font(type.title)};color:${colors.ink};width:44px;
            padding:${spacing.sm + 2}px 0;text-align:center">6</div>
        <div style="${font(type.title)};color:${colors.inkFaint};margin:0 2px">:</div>
        <div style="${font(type.title)};color:${colors.ink};width:44px;
            padding:${spacing.sm + 2}px 0;text-align:center">30</div>
      </div>
    </div>
    <!-- 적은 것이 언제로 읽혔는지 되돌려 준다. -->
    <div style="${font(type.caption)};color:${colors.inkSoft};
        margin-top:${spacing.sm}px;margin-bottom:${spacing.lg}px">${dayLabel(APPOINTMENT_MS, NOW_MS)} ${formatClock(APPOINTMENT_MS)}</div>

    <div style="${font(type.caption)};color:${colors.inkSoft};margin-bottom:${spacing.sm}px">누구를 만나요?</div>
    <div style="background:${colors.surface};border-radius:${radius.md}px;padding:${spacing.md}px">
      <span style="${font(type.body)};color:${colors.ink}">지우</span>
    </div>

    <div style="flex:1"></div>

    <div style="background:${colors.ink};border-radius:${radius.md}px;
        padding:${spacing.md + 2}px 0;text-align:center;
        ${font(type.title)};color:${colors.surface}">다음</div>
    <div style="padding:${spacing.md}px 0;text-align:center;
        ${font(type.caption)};color:${colors.inkFaint}">지나온 길 · ${formatTotalDistance(12_430)}km</div>
  `, { back: false });
}

function mood() {
  const rows = MOODS.map(
    (m) => `<div style="display:flex;align-items:center;gap:${spacing.md}px;
        padding:${spacing.lg}px 0;border-bottom:1px solid ${colors.line}">
      <div style="width:10px;height:10px;border-radius:${radius.pill}px;background:${MOOD_TINT[m.id]}"></div>
      <div style="${font(type.title)};color:${colors.ink}">${m.label}</div>
    </div>`
  ).join('');

  return screen(
    `<div style="${font(type.display)};color:${colors.ink};margin-bottom:${spacing.xl}px">지우 만나러 가는 길,<br/>지금 기분이 어때요?</div>
     <div style="border-top:1px solid ${colors.line}">${rows}</div>
     <div style="${font(type.caption)};color:${colors.inkFaint};margin-top:${spacing.lg}px;text-align:center">고르면 알아서 길을 찾아드려요.</div>`,
    { style: 'justify-content:center' }
  );
}

function route() {
  return screen(`
    <div style="${font(type.display)};color:${colors.ink};margin-top:${spacing.xl}px">3분 전에 닿는 길이에요.</div>

    <div style="margin-top:${spacing.lg}px">
      <div style="height:180px">${ribbon(WALK_PATH, MOOD_TINT.pensive)}</div>

      <div style="margin-top:${spacing.md}px">
        <div style="${font(type.numeral, { fontSize: 44, lineHeight: 52 })};color:${colors.ink}">${formatDuration(27 * 60)}</div>
        <!--
          도착 시각. 앱이 화면에 적는 줄이라 여기서도 적는다.
          맞는 길이면 약속 3분 전이 나오므로 그 값을 그대로 쓴다 —
          숫자를 손으로 적어 두면 3분이 바뀌는 날 이 그림만 옛말을 하게 된다.
        -->
        <div style="${font(type.caption)};color:${colors.inkSoft};margin-top:${spacing.xs}px">${formatClock(APPOINTMENT_MS - ARRIVE_EARLY_SEC * 1000)} 도착</div>
        <div style="${font(type.caption)};color:${colors.inkFaint};margin-top:2px">2.1km · ${formatClock(APPOINTMENT_MS)} 약속</div>
      </div>

      <div style="${font(type.body)};color:${colors.ink};margin-top:${spacing.md}px;
          padding-top:${spacing.md}px;border-top:1px solid ${colors.line}">신호등이 적어서 생각이 잘 안 끊겨요</div>
      <div style="${font(type.caption)};color:${colors.inkFaint};margin-top:${spacing.sm}px">가는 길에 대림창고가 있어요</div>
    </div>

    <div style="padding:${spacing.md}px 0;text-align:center;
        ${font(type.body)};color:${colors.inkSoft};text-decoration:underline">다른 길로 보여주세요</div>

    <div style="flex:1"></div>

    <div style="background:${colors.ink};border-radius:${radius.md}px;
        padding:${spacing.md + 2}px 0;text-align:center;
        ${font(type.title)};color:${colors.surface}">이 길로 갈게요</div>
  `);
}

function walk() {
  return screen(`
    <div style="flex:1"></div>

    <div style="text-align:center;margin-bottom:${spacing.xl}px">
      <div style="${font(type.caption)};color:${colors.inkSoft}">도착까지</div>
      <div style="${font(type.numeral)};color:${colors.ink}">${formatDuration(18 * 60)}</div>
      <div style="${font(type.body)};color:${colors.inkSoft};margin-top:${spacing.xs}px">1,240m 남았어요</div>
    </div>

    <!-- 페이스 안내. 걷는 중에만 색을 쓴다 — 경고가 아니라 종이 위에 얹은 정도로. -->
    <div style="background:#E9EEF6;border-radius:${radius.lg}px;
        padding:${spacing.lg}px;min-height:96px;box-sizing:border-box;
        display:flex;align-items:center;justify-content:center;
        ${font(type.title)};color:${colors.ink}">조금 천천히 걸어도 돼요</div>

    <div style="${font(type.caption)};color:${colors.inkFaint};text-align:center;
        margin-top:${spacing.xl}px">성수역 3번 출구까지 3분 전에 도착하도록 맞추고 있어요.</div>

    <div style="flex:1"></div>

    <div style="padding:${spacing.md}px 0;text-align:center;
        ${font(type.body)};color:${colors.inkSoft};text-decoration:underline">이미 도착했어요</div>
  `);
}

function arrive() {
  return screen(`
    <div style="${font(type.caption)};color:${colors.inkSoft};margin-top:${spacing.lg}px">약속까지</div>
    <div style="${font(type.numeral, { fontSize: 64, lineHeight: 72 })};color:${colors.ink}">2:47</div>

    <div style="${font(type.title)};color:${colors.ink};margin-top:${spacing.md}px">${arrivalPrompt('지우').replace('\n', '<br/>')}</div>
    <div style="${font(type.body)};color:${colors.inkSoft};margin-top:${spacing.sm}px">성수역, 지금 보통이에요</div>

    <div style="background:${colors.surface};border-radius:${radius.md}px;
        padding:${spacing.md}px;margin-top:${spacing.xl}px;min-height:120px;box-sizing:border-box">
      <div style="${font(type.body)};color:${colors.inkFaint}">${NOTE_PLACEHOLDER}</div>
    </div>
    <div style="${font(type.caption)};color:${colors.inkFaint};margin-top:${spacing.sm}px">적어두면 지나온 길에 그대로 남아 있어요.</div>

    <div style="flex:1"></div>

    <div style="background:${colors.ink};border-radius:${radius.md}px;
        padding:${spacing.md + 2}px 0;text-align:center;
        ${font(type.title)};color:${colors.surface}">그냥 닫기</div>
  `);
}

function trace() {
  const grid = RECORD_PATHS.map((p, i) => glyph(p, MOOD_TINT[RECORDS[i % RECORDS.length].mood])).join('');

  const rows = RECORDS.map(
    (r) => `<div style="display:flex;align-items:flex-start;gap:${spacing.md}px;
        padding:${spacing.md}px 0;border-bottom:1px solid ${colors.line}">
      ${glyph(r.path, MOOD_TINT[r.mood])}
      <div style="flex:1;padding-top:${spacing.xs}px;min-width:0">
        <div style="${font(type.body)};color:${colors.ink}">${r.title}</div>
        <div style="${font(type.caption)};color:${colors.inkFaint};margin-top:2px">${r.meta}</div>
        ${r.note !== '' ? `<div style="${font(type.body)};color:${colors.inkSoft};margin-top:${spacing.sm}px">${r.note}</div>` : ''}
      </div>
    </div>`
  ).join('');

  return screen(`
    <div style="${font(type.caption)};color:${colors.inkSoft}">지금까지 걸은 길</div>
    <div style="display:flex;align-items:flex-end">
      <div style="${font(type.numeral)};color:${colors.ink}">${formatTotalDistance(12_430)}</div>
      <div style="${font(type.caption)};color:${colors.inkFaint};margin-left:${spacing.xs}px;margin-bottom:${spacing.sm}px">km</div>
    </div>
    <div style="${font(type.caption)};color:${colors.inkFaint};margin-top:${spacing.xs}px">9번 걸었고, 5번 한 줄을 남겼어요</div>

    <div style="display:flex;flex-wrap:wrap;gap:${spacing.sm}px;margin-top:${spacing.lg}px">${grid}</div>

    <div style="margin-top:${spacing.xl}px">
      <div style="${font(type.caption)};color:${colors.inkSoft};padding-bottom:${spacing.sm}px;
          border-bottom:1px solid ${colors.line}">2026년 8월</div>
      ${rows}
    </div>
  `, { fade: true });
}

/* ------------------------------------------------------------------ *
 * 캔버스
 * ------------------------------------------------------------------ */

/** 기기 틀. 그림자 하나로만 띄운다 — 면을 더 만들지 않는다. */
function device(inner) {
  return `<div style="width:${PHONE.width}px;height:${PHONE.height}px;
      border-radius:36px;overflow:hidden;background:${colors.bg};
      box-shadow:0 18px 44px rgba(23,24,27,.10), 0 2px 6px rgba(23,24,27,.05);">
    <div style="transform:scale(${PHONE.scale});transform-origin:top left">${inner}</div>
  </div>`;
}

function portrait({ headline, sub, body }) {
  return `<div style="width:${PORTRAIT.width}px;height:${PORTRAIT.height}px;background:${colors.bg};
      display:flex;flex-direction:column;align-items:center;box-sizing:border-box;
      padding:${spacing.xxl}px 0 0;overflow:hidden">
    <div style="text-align:center;padding:0 ${spacing.xl}px">
      <div style="${font(type.display)};color:${colors.ink}">${headline}</div>
      <div style="${font(type.body)};color:${colors.inkSoft};margin-top:${spacing.sm}px">${sub}</div>
    </div>
    <div style="margin-top:${spacing.xl}px">${device(body)}</div>
  </div>`;
}

/**
 * 가로 한 장. 흐름을 보여주는 자리다 — 고르고, 받고, 걷는다.
 * 세로 한 장이 화면 하나를 말한다면 여기서는 순서를 말한다.
 *
 * 폭이 1504px뿐이라 폰을 세 대 놓으면 실제 크기로는 넘친다. 잘라내는 대신
 * 축소해서 세 대가 다 들어오게 한다 — 오른쪽이 잘린 이미지는 흐름을 못 보여준다.
 */
function landscape() {
  const W = 292; // 셋을 나란히 놓고도 왼쪽 글과 함께 1504 안에 들어오는 폭
  const H = 508;
  const scale = W / 390;

  const step = (label, body, shiftY) => `<div style="display:flex;flex-direction:column;align-items:center">
    <div style="width:${W}px;height:${H}px;border-radius:26px;overflow:hidden;
        background:${colors.bg};box-shadow:0 14px 36px rgba(23,24,27,.10), 0 2px 6px rgba(23,24,27,.05)">
      <div style="transform:scale(${scale}) translateY(${-shiftY}px);transform-origin:top left">${body}</div>
    </div>
    <div style="${font(type.caption)};color:${colors.inkFaint};margin-top:${spacing.md}px">${label}</div>
  </div>`;

  return `<div style="width:${LANDSCAPE.width}px;height:${LANDSCAPE.height}px;background:${colors.bg};
      display:flex;align-items:center;gap:${spacing.xxl}px;padding:0 ${spacing.xxl}px;
      box-sizing:border-box;overflow:hidden">
    <div style="width:300px;flex:none">
      <div style="${font(type.display)};color:${colors.ink}">약속 3분 전에<br/>도착하는 길</div>
      <div style="${font(type.body)};color:${colors.inkSoft};margin-top:${spacing.md}px">
        일찍 도착해 애매하게 남는 시간을<br/>걷기로 채워요. 기분만 고르면<br/>나머지는 앱이 정해요.</div>
    </div>
    <div style="display:flex;gap:${spacing.lg}px">
      ${step('기분을 고르면', mood(), 60)}
      ${step('길과 이유를 주고', route(), 40)}
      ${step('3분 전에 맞춰줘요', walk(), 70)}
    </div>
  </div>`;
}

/* ------------------------------------------------------------------ *
 * 굽기
 * ------------------------------------------------------------------ */

const SHOTS = [
  {
    name: '01-home',
    ...PORTRAIT,
    html: portrait({
      headline: '20분 거리에 30분이 남았을 때',
      sub: '장소를 찾고, 약속 시각을 적으면 돼요.',
      body: home(),
    }),
  },
  {
    name: '02-mood',
    ...PORTRAIT,
    html: portrait({
      headline: '고를 건 기분 하나',
      sub: '경사도 그늘도 직접 고르지 않아요.',
      body: mood(),
    }),
  },
  {
    name: '03-route',
    ...PORTRAIT,
    html: portrait({
      headline: '왜 이 길인지 말해줘요',
      sub: '설명할 수 없는 길은 권하지 않아요.',
      body: route(),
    }),
  },
  {
    name: '04-walk',
    ...PORTRAIT,
    html: portrait({
      headline: '빠르면 천천히, 늦으면 조금 빠르게',
      sub: '걷는 속도를 3분 전에 맞춰줘요.',
      body: walk(),
    }),
  },
  {
    name: '05-arrive',
    ...PORTRAIT,
    html: portrait({
      headline: '남은 3분은 기록의 시간',
      sub: '안 적고 닫아도 괜찮아요.',
      body: arrive(),
    }),
  },
  {
    name: '06-trace',
    ...PORTRAIT,
    html: portrait({
      headline: '걸은 길이 모양으로 쌓여요',
      sub: '그날의 기분 색을 그대로 띠고요.',
      body: trace(),
    }),
  },
  { name: '07-wide', ...LANDSCAPE, html: landscape() },
];

/**
 * 한 장을 감싸는 문서.
 *
 * 글꼴은 Pretendard를 먼저 부른다. 없으면 시스템 한글 글꼴로 떨어지는데,
 * 그때는 자간이 달라져 줄이 밀린다 — 없으면 없다고 알려주고 만다.
 */
const page = (html) => `<!doctype html><meta charset="utf-8">
<style>
  @font-face { font-family:'Pretendard'; src:local('Pretendard'); }
  *{margin:0;padding:0;box-sizing:content-box}
  body{font-family:'Pretendard','Apple SD Gothic Neo','Noto Sans KR',sans-serif;
       -webkit-font-smoothing:antialiased}
</style>${html}`;

function loadChromium() {
  // playwright는 이 저장소의 의존성이 아니다. 스토어 이미지를 만들 때만 쓰는 도구라
  // 앱을 설치하는 사람 모두가 브라우저를 내려받게 할 이유가 없다.
  const require = createRequire(import.meta.url);
  for (const id of ['playwright', 'playwright-core']) {
    try {
      return require(id).chromium;
    } catch {
      /* 다음 후보 */
    }
  }
  return null;
}

mkdirSync(OUT, { recursive: true });

for (const shot of SHOTS) {
  writeFileSync(path.join(OUT, `${shot.name}.html`), page(shot.html));
}
console.log(`${SHOTS.length}장의 HTML을 assets/store/에 썼어요.`);

const chromium = loadChromium();
if (chromium == null) {
  console.log('\nplaywright가 없어 PNG는 만들지 못했어요.');
  console.log('  npm i -D playwright  후에 다시 실행하거나,');
  console.log('  assets/store/*.html을 각 크기에 맞춘 창에서 직접 캡처하세요.');
  process.exit(0);
}

/*
 * 미리 깔린 브라우저를 쓸 수도 있게 둔다. 컨테이너나 CI에는 브라우저가 이미
 * 있는데 playwright가 제 버전의 빌드만 찾다가 멈추는 일이 흔하다.
 *   PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium
 */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM;
const browser = await chromium.launch(executablePath != null ? { executablePath } : {});
try {
  for (const shot of SHOTS) {
    // deviceScaleFactor는 1이어야 한다. 2로 두면 요구 크기의 두 배가 나와
    // 콘솔이 되돌려 보낸다.
    const page_ = await browser.newPage({
      viewport: { width: shot.width, height: shot.height },
      deviceScaleFactor: 1,
    });
    await page_.goto(`file://${path.join(OUT, `${shot.name}.html`)}`);
    await page_.screenshot({ path: path.join(OUT, `${shot.name}.png`) });
    await page_.close();
    console.log(`  ${shot.name}.png — ${shot.width}x${shot.height}`);
  }
} finally {
  await browser.close();
}

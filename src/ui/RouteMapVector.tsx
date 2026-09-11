import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import WebView from '@granite-js/native/react-native-webview';
import { getApiConfig } from '../config';
import { splitPath } from '../domain/geo';
import { arrowMetrics, arrowPolygon, routeArrows, type RouteArrow } from '../domain/route-arrows';
import { MAPLIBRE_CSS, MAPLIBRE_JS, MAPLIBRE_LICENSE } from './vendor/maplibre';
import { type Palette, type Scheme, type TypeScale, useStyles, useTheme } from './useTheme';
import { colors as lightColors } from './theme';
import { moodTint } from './moodTint';
import type { LatLng, MoodId } from '../domain/types';

/**
 * 벡터 타일 지도 (OpenFreeMap + MapLibre).
 *
 * 래스터판(`RouteMapRaster`)과 보이는 건 거의 같고, 다른 건 **조건**이다.
 * CARTO는 지금 키 없이 받아지지만 문서상으로는 키를 요구하고 상업적 사용에
 * 별도 라이선스를 둔다. OpenFreeMap은 키도, 등록도, 요청 한도도, 상업적 제한도 없다.
 * 대신 벡터라서 그리는 쪽이 필요하고, 그게 MapLiben이 웹뷰 안에 있는 이유다.
 *
 * 값이 있다. 웹뷰가 하나 뜨고, 번들에 1MB가 붙고, 배터리를 더 쓴다.
 * 그래서 두 판을 다 두고 `config.mapTiles.kind`로 고른다 — 샌드박스에서
 * 나란히 보고 정할 수 있어야 한다.
 *
 * 지도는 손대지 못하게 둔다(`interactive: false`). 래스터판과 같은 성질이고,
 * 무엇보다 두 화면 모두 스크롤 안에 들어 있어서 끌기 제스처가 겹친다.
 */
/**
 * 걷는 동안 지도가 붙어 있는 배율.
 *
 * **길 전체를 담고 있으면 움직임이 안 보인다.** 2.3km 경로를 420px 상자에 맞추면
 * 1px이 5.5m라, 다섯 걸음(5m)을 걸어도 점이 0.91px 움직인다 — 1픽셀도 못 간다.
 * 걸어온 길을 실선으로 채워 넣어도 그 실선이 자라는 게 안 보이는 게 당연했다.
 *
 * 17은 1px이 0.95m라 다섯 걸음이 5px가 되고, 화면에 400m쯤 담긴다 —
 * 다음 골목까지가 보이는 거리다.
 */
const FOLLOW_ZOOM = 17;

/**
 * 따라가는 동안의 화살표 간격·크기 (m).
 *
 * 평소 크기는 경계 상자 비율로 낸다(`arrowMetrics`). 그런데 따라가기는 상자와
 * 무관한 배율로 보므로, 2.3km짜리 상자에 맞춰 만든 76m짜리 화살표가 화면에서
 * 63px가 된다 — 길이 화살표에 덮인다. 따라갈 때는 땅 위의 실제 크기로 잡는다.
 */
const FOLLOW_SPACING_M = 80;
const FOLLOW_ARROW_M = 16;

export function RouteMapVector({
  path,
  height = 220,
  fill: fillBox = false,
  moodId,
  tint,
  progress,
}: {
  path: LatLng[];
  height?: number;
  /** 기분. 주면 밝은 타일에 맞는 색을 여기서 고른다 — 아래 mapColors와 같은 이유. */
  moodId?: MoodId;
  /** 남은 높이를 다 쓴다. 걷는 화면에서 지도를 주인공으로 둘 때. */
  fill?: boolean;
  /** 기분 색. 없으면 테마의 잉크색으로 그린다. */
  tint?: string;
  progress?: number;
}) {
  const { colors, scheme } = useTheme();
  const styles = useStyles(createStyles);
  /**
   * 진행이 들어오는 화면인가 — 걷는 중인가.
   *
   * 값이 아니라 **있는지 없는지**만 본다. 걷는 내내 참으로 고정되므로 이걸
   * 의존성에 넣어도 HTML이 다시 만들어지지 않는다.
   */
  const follows = progress != null;
  /*
   * **그리는 색은 어두운 테마에서도 밝은 쪽을 쓴다.**
   *
   * OpenFreeMap의 어두운 스타일은 이 저장소에서 확인된 적이 없어서 두 테마 모두
   * 같은(밝은) 타일을 쓴다 — 바로 위 지도 생성 주석에 그 사정이 적혀 있다. 그런데
   * 선 색만 테마를 따라가서, 어두운 모드에서는 흰 도로 위에 옅은 파스텔(#A6BCA8
   * 같은)이 얹혔다. 대비 2:1 남짓이라 "걷는 게 안 보인다"는 그 피드백을 고치려고
   * 올린 실선이 정작 어두운 모드에서는 더 안 보이게 됐다.
   *
   * 종이가 밝으면 잉크도 밝은 쪽 잉크여야 한다. 래스터판은 CARTO의 어두운 짝을
   * 실제로 쓰므로 거기서는 테마를 그대로 따른다 — 그래서 이 보정은 여기에만 둔다.
   */
  const mapColors = lightColors;
  // 밝은 종이 위의 잉크. 기분을 받으면 밝은 쪽 색으로 직접 고르고, 없으면 넘어온
  // 색을 쓰되 기본값도 밝은 쪽 잉크다.
  const stroke = moodId != null ? moodTint(moodId, 'light') : (tint ?? mapColors.ink);
  const webView = useRef<WebView>(null);

  /*
   * HTML은 경로가 바뀔 때만 다시 만든다.
   *
   * 1MB짜리 문자열이라 걸음마다 새로 만들면 그 자체로 화면이 버벅인다.
   * 진행 상황은 아래에서 `injectJavaScript`로 밀어 넣는다 — 지도는 그대로 두고
   * 선 두 개만 갈아 끼우는 것이라 훨씬 가볍다.
   */
  /*
   * 화살표는 **경로당 한 번만** 잰다.
   *
   * 자리와 크기는 경로에서만 나오는데 진행률과 함께 묶어 두면 위치가 들어올 때마다
   * (3초·5m) 경로 전체를 다시 훑고 삼각형을 다시 만든다. Hermes에는 JIT이 없어서
   * 그 반복이 그대로 값이 된다 — 걷는 내내, 화면이 켜져 있는 채로.
   * 여기서 재 두고 아래에서는 지나친 것만 걷어낸다.
   */
  /*
   * 화살표를 **두 벌** 만든다.
   *
   * 화살표는 지리 좌표 폴리곤이라 화면 크기가 배율을 따라간다. 전체 보기에 맞춘
   * 76m짜리는 따라가기 배율에서 80px가 되어 길을 덮고, 따라가기에 맞춘 16m짜리는
   * 전체 보기에서 2.9px로 사라진다(실측). 한 벌로는 두 배율을 못 덮는다.
   *
   * 웹뷰는 자기 힘으로 화살표를 다시 만들 수 없으므로(모양 계산은 이쪽에 있다)
   * 두 벌을 다 보내 두고 보기를 바꿀 때 켜고 끈다.
   */
  const arrows = useMemo<Arrows>(() => {
    const { spacingM, sizeM } = arrowMetrics(path);
    const wide = { all: routeArrows(path, spacingM), sizeM };
    return {
      wide,
      near: follows
        ? { all: routeArrows(path, FOLLOW_SPACING_M), sizeM: FOLLOW_ARROW_M }
        : null,
    };
  }, [path, follows]);

  const html = useMemo(
    () => mapHtml(path, stroke, mapColors, 'light', arrows, follows),
    [path, stroke, mapColors, arrows, follows]
  );

  const update = useMemo(
    () => (progress == null ? null : progressScript(path, progress, arrows)),
    [path, progress, arrows]
  );

  /*
   * 렌더 중에 밀어 넣으면 안 된다.
   *
   * 처음 렌더에서는 ref가 아직 비어 있어 그 한 번이 통째로 사라지고, 그 뒤로는
   * **렌더할 때마다** 같은 조각이 다시 들어간다. 걷는 화면은 1초에 한 번 다시 그리므로
   * 걷는 내내 초당 한 번씩 소스 세 개를 갈아 끼우게 된다 — 값이 그대로여도.
   *
   * effect로 옮기면 `update` 문자열이 실제로 달라졌을 때만 나간다.
   */
  useEffect(() => {
    if (update != null) {
      // 지도가 아직 안 떴으면 웹뷰 쪽이 들고 있다가 뜰 때 반영한다.
      webView.current?.injectJavaScript(update);
    }
  }, [update]);

  /*
   * 첫 조각은 페이지가 뜨기 전에 나가서 조용히 사라진다 — `window.__setProgress &&`
   * 가드가 그냥 지나친다. 그런데 출발 자리에 서 있는 동안(신호 대기)은 진행이 0에서
   * 안 바뀌어 위 effect가 다시는 안 돌므로, 움직이기 전까지 지금-자리 점이 영영 없다.
   * 페이지가 뜬 시점에 마지막 조각을 한 번 더 보내 그 구멍을 막는다.
   */
  const latest = useRef<string | null>(null);
  latest.current = update;
  const resend = () => {
    if (latest.current != null) {
      webView.current?.injectJavaScript(latest.current);
    }
  };

  return (
    <View style={[styles.box, fillBox ? styles.fillBox : { height }]}>
      <WebView
        ref={webView}
        source={{ html }}
        style={styles.web}
        // 종이빛 바탕. 타일이 오기 전 흰 판이 번쩍이지 않게.
        containerStyle={styles.web}
        // 지도 안에서 스크롤·확대를 막는다. 화면의 스크롤과 싸우지 않게.
        scrollEnabled={false}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        // iOS에서 웹뷰가 스스로 위아래로 튀는 것을 막는다.
        bounces={false}
        overScrollMode="never"
        androidLayerType="hardware"
        onLoadEnd={resend}
      />
    </View>
  );
}

/** 선을 그릴 GeoJSON. MapLibre는 [경도, 위도] 순서다 — 뒤집으면 바다 한가운데가 된다. */
function lineString(points: LatLng[]): string {
  return JSON.stringify({
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: points.map((p) => [p.lng, p.lat]) },
  });
}

/** 화살표들. 링을 닫는 일은 `arrowPolygon`이 이미 했다. */
function arrowsJson(arrows: RouteArrow[], sizeM: number): string {
  return JSON.stringify({
    type: 'FeatureCollection',
    features: arrows.map((arrow) => ({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [arrowPolygon(arrow, sizeM).map((p) => [p.lng, p.lat])],
      },
    })),
  });
}

function point(at: LatLng): string {
  return JSON.stringify({
    type: 'Feature',
    properties: {},
    geometry: { type: 'Point', coordinates: [at.lng, at.lat] },
  });
}

/**
 * 진행 상황만 갈아 끼우는 조각.
 *
 * 끝에 `true;`를 붙이는 건 iOS 규칙이다 — `injectJavaScript`가 돌려주는 값이
 * 문자열이 아니면 경고가 뜬다.
 */
function progressScript(path: LatLng[], progress: number, arrows: Arrows): string {
  const split = splitPath(path, progress);
  if (split == null) {
    return 'true;';
  }
  // 자리는 길에 박혀 있고 지나친 것만 사라진다. 남은 구간에 새로 배치하면
  // 걸음마다 화살표가 재배치되어 지도가 들썩인다.
  return `window.__setProgress && window.__setProgress(
    ${lineString(split.walked)}, ${lineString(split.ahead)}, ${point(split.at)},
    ${aheadArrows(arrows.wide, progress)}, ${aheadArrows(arrows.near, progress)}
  ); true;`;
}

/** 한 배율에서 쓸 화살표 한 벌. */
interface ArrowSet {
  all: RouteArrow[];
  sizeM: number;
}

/**
 * 경로당 한 번 재 두는 화살표. 자리와 크기는 진행률과 무관하다.
 *
 * 두 벌인 이유는 위 `arrows` 메모에 적어 뒀다 — 전체 보기와 따라가기는 배율이
 * 대여섯 배 달라서 한 벌로는 양쪽에서 다 읽히지 않는다.
 */
interface Arrows {
  /** 길 전체를 담은 배율에서 쓴다. */
  wide: ArrowSet;
  /** 걷는 사람을 따라가는 배율에서 쓴다. 걷는 화면이 아니면 없다. */
  near: ArrowSet | null;
}

const NO_ARROWS = '{"type":"FeatureCollection","features":[]}';

/** 아직 지나지 않은 화살표만. 지나친 것은 걷어낸다. */
function aheadArrows(set: ArrowSet | null, progress: number): string {
  if (set == null) {
    return NO_ARROWS;
  }
  return arrowsJson(
    set.all.filter((arrow) => arrow.alongRatio > progress),
    set.sizeM
  );
}

function mapHtml(
  path: LatLng[],
  tint: string,
  colors: Palette,
  scheme: Scheme,
  arrows: Arrows,
  follows: boolean
): string {
  const { mapTiles } = getApiConfig();
  const bounds = path.reduce(
    (box, p) => ({
      west: Math.min(box.west, p.lng),
      south: Math.min(box.south, p.lat),
      east: Math.max(box.east, p.lng),
      north: Math.max(box.north, p.lat),
    }),
    { west: Infinity, south: Infinity, east: -Infinity, north: -Infinity }
  );

  const start = path[0];
  const end = path[path.length - 1];
  // 아직 한 걸음도 안 걸었으므로 처음엔 전부 '남은' 화살표다.
  const wideArrows = arrowsJson(arrows.wide.all, arrows.wide.sizeM);
  const nearArrows = arrows.near == null
    ? NO_ARROWS
    : arrowsJson(arrows.near.all, arrows.near.sizeM);

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"/>
<!--
  MapLibre GL JS — BSD-3-Clause. 전문:
  ${MAPLIBRE_LICENSE.replace(/--/g, '- -')}
-->
<style>${MAPLIBRE_CSS}</style>
<style>
  html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; }
  body { background: ${colors.bg}; }
  /* 출처는 지우지 않는다. OpenStreetMap과 OpenMapTiles 둘 다 요구한다. */
  .maplibregl-ctrl-attrib {
    font-size: 11px;
    background: ${scheme === 'dark' ? 'rgba(22,24,28,0.82)' : 'rgba(255,255,255,0.82)'};
    color: ${colors.inkSoft};
  }
  .maplibregl-ctrl-attrib a { color: ${colors.inkSoft}; }
  .maplibregl-ctrl-bottom-left, .maplibregl-ctrl-logo { display: none; }
  /*
    보기 전환. 누를 수 있다는 걸 알리되 지도를 가리지 않게 — 출처 표기와 같은
    반투명 판 위에 글자만 둔다. 걷는 화면이 아니면 아래 스크립트가 계속 숨긴다.
  */
  #view-toggle {
    display: none;
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 2;
    border: 0;
    border-radius: 999px;
    padding: 7px 13px;
    font-family: inherit;
    font-size: 13px;
    line-height: 1;
    color: ${colors.inkSoft};
    background: rgba(255,255,255,0.9);
    box-shadow: 0 1px 3px rgba(0,0,0,0.14);
  }
</style>
<script>${MAPLIBRE_JS}</script>
</head>
<body>
<div id="map"></div>
<button id="view-toggle" type="button">전체 보기</button>
<script>
(function () {
  var TINT = ${JSON.stringify(tint)};
  var PAPER = ${JSON.stringify(colors.surface)};
  var FAINT = ${JSON.stringify(colors.inkFaint)};

  /*
   * 스타일을 못 받아도 경로는 그린다.
   *
   * 소스와 레이어를 'load' 한 번에만 얹으면, 스타일 요청이 실패했을 때 그 이벤트가
   * 영영 안 와서 빈 상자만 남는다. 비행기 모드에서 래스터판은 타일만 비고 경로는
   * 그대로 나오는데, 그 성질을 여기서 잃으면 안 된다.
   *
   * 그래서 스타일이 바뀔 때마다('styledata') 다시 얹고, 스타일이 깨지면 종이 한 장짜리
   * 빈 스타일로 갈아탄다. 갈아타면 'styledata'가 다시 오고 경로가 그 위에 그려진다.
   */
  var BLANK = { version: 8, sources: {}, layers: [
    { id: 'paper', type: 'background', paint: { 'background-color': ${JSON.stringify(colors.bg)} } }
  ] };

  var BOUNDS = [[${bounds.west}, ${bounds.south}], [${bounds.east}, ${bounds.north}]];
  var FIT = { padding: 24, animate: false };
  /** 마지막으로 받은 진행 상황. 스타일이 바뀌어도 이 값으로 다시 그린다. */
  var latest = null;
  /** 마지막으로 알려진 지금-자리. 상자 크기가 바뀔 때 여기로 되돌아간다. */
  var latestCenter = null;

  /*
   * 걷는 중이면 길 전체가 아니라 걷는 사람을 따라간다.
   *
   * 다만 따라가면 길 전체가 안 보이므로(400m쯤만 담긴다) 눌러서 오갈 수 있게 한다.
   * following은 그 상태고, CAN_FOLLOW는 이 화면에 그 선택지가 있는지다 —
   * 길을 고르는 화면에는 진행이 없으니 전환할 것도 없다.
   */
  var CAN_FOLLOW = ${follows ? 'true' : 'false'};
  var following = CAN_FOLLOW;
  var FOLLOW_ZOOM = ${FOLLOW_ZOOM};
  var toggle = document.getElementById('view-toggle');

  /** 지금 보기에 맞는 화살표만 켜고, 버튼에 다음 동작을 적는다. */
  function applyView() {
    if (!map.getLayer('arrows-wide')) { return; }
    map.setLayoutProperty('arrows-wide', 'visibility', following ? 'none' : 'visible');
    map.setLayoutProperty('arrows-near', 'visibility', following ? 'visible' : 'none');
    if (toggle) { toggle.textContent = following ? '전체 보기' : '따라가기'; }
  }

  /** 길 전체를 담는 자리로. */
  function showWhole(animate) {
    map.fitBounds(BOUNDS, { padding: 24, animate: !!animate, duration: 600 });
  }

  /** 걷는 사람 자리로. 아직 위치를 모르면 길 전체를 보여준다. */
  function showWalker(duration) {
    if (latestCenter == null) { showWhole(true); return; }
    map.easeTo({ center: latestCenter, zoom: FOLLOW_ZOOM, duration: duration });
  }

  var map = new maplibregl.Map({
    container: 'map',
    /*
     * 어두운 화면에서도 같은 스타일을 쓴다.
     *
     * OpenFreeMap에 어두운 스타일이 있는지 이 작업 환경에서는 확인하지 못했다
     * (egress 정책에 막혀 있다). 확인 안 된 주소를 넣으면 지도가 통째로 안 뜨므로,
     * 실기기에서 확인한 뒤에 갈아 끼운다. 래스터판은 CARTO의 어두운 짝을 이미 쓴다.
     */
    style: ${JSON.stringify(mapTiles.vectorStyleUrl)},
    // 손대지 못하게 둔다. 두 화면 모두 스크롤 안에 있어서 끌기가 겹친다.
    interactive: false,
    attributionControl: { compact: false },
    bounds: BOUNDS,
    fitBoundsOptions: FIT
  });

  /*
   * 상자가 커지거나 줄면 경계를 **다시** 맞춘다.
   *
   * 지도는 처음 한 번만 경로에 맞춰 놓이고, 그 뒤에 컨테이너 크기가 바뀌면 중심과
   * 배율만 지킨 채 다시 맞추지 않는다 — 경로가 한쪽으로 밀리거나 화면 밖으로 나간다.
   *
   * 걷는 화면에서 지도는 남은 높이를 전부 가져가므로, 아래 안내 카드가 한 줄에서
   * 두 줄로 바뀌기만 해도 이 상자의 높이가 달라진다. 카드 쪽에서도 높이를 붙들어
   * 두었지만(minHeight 88), 시스템 글꼴을 키우면 그 약속이 깨진다.
   * 크기가 변하는 모든 경우를 여기서 한 번에 받는다.
   */
  window.addEventListener('resize', function () {
    // 따라가는 중에 경로 전체로 다시 맞추면 걷는 사람을 놓친다.
    if (following && latestCenter) {
      map.easeTo({ center: latestCenter, zoom: FOLLOW_ZOOM, duration: 0 });
      return;
    }
    map.fitBounds(BOUNDS, FIT);
  });

  /*
   * 눌러서 두 보기를 오간다.
   *
   * 지도는 여전히 손대지 못한다(interactive: false) — 끌기는 화면의 스크롤과
   * 싸우기 때문이다. 누르는 것은 끌기가 아니라 그 다툼이 없고, 걷는 화면에는
   * 스크롤 자체가 없다.
   */
  if (CAN_FOLLOW) {
    if (toggle) { toggle.style.display = 'block'; }

    function switchView(event) {
      event.preventDefault();
      event.stopPropagation();
      following = !following;
      applyView();
      if (following) { showWalker(600); } else { showWhole(true); }
    }

    /*
     * 버튼과 지도 **둘 다** 받는다.
     *
     * 버튼은 지도의 형제라서 버튼을 눌러도 지도로 올라가지 않는다 — 지도에만
     * 달아 뒀더니 정작 "전체 보기"라고 적힌 알약이 눌리지 않았다. 눌러야 할
     * 것처럼 생긴 것이 안 눌리는 게 가장 나쁘다.
     *
     * 지도 쪽도 남겨 둔다. 걷는 화면에는 스크롤이 없어 탭이 다른 제스처와
     * 싸우지 않고, 걸으면서 한 손으로 아무 데나 누르는 편이 쉽다.
     */
    if (toggle) { toggle.addEventListener('click', switchView); }
    document.getElementById('map').addEventListener('click', switchView);
  }

  var whole = ${lineString(path)};
  var start = ${point(start)};
  var end = ${point(end)};

  var fellBack = false;

  function src(id, data) {
    if (map.getSource(id)) { map.getSource(id).setData(data); return; }
    map.addSource(id, { type: 'geojson', data: data });
  }

  function line(id, source, color, width, extra, layout) {
    if (map.getLayer(id)) { return; }
    map.addLayer({ id: id, type: 'line', source: source,
      // 점선은 'line-cap': 'round'와 같이 못 쓴다 — 둥근 끝이 칸을 메워
      // 점선이 실선으로 보인다. 그래서 레이아웃을 열어 둔다.
      layout: Object.assign({ 'line-cap': 'round', 'line-join': 'round' }, layout || {}),
      paint: Object.assign({ 'line-color': color, 'line-width': width }, extra || {}) });
  }

  function fill(id, source, color, extra) {
    if (map.getLayer(id)) { return; }
    map.addLayer({ id: id, type: 'fill', source: source,
      paint: Object.assign({ 'fill-color': color }, extra || {}) });
  }

  function circle(id, source, radius, fill, stroke, strokeWidth, extra) {
    if (map.getLayer(id)) { return; }
    map.addLayer({ id: id, type: 'circle', source: source,
      paint: Object.assign({
        'circle-radius': radius, 'circle-color': fill,
        'circle-stroke-color': stroke, 'circle-stroke-width': strokeWidth
      }, extra || {}) });
  }

  /** 여러 번 불려도 괜찮게 둔다 — 스타일이 바뀔 때마다 다시 온다. */
  function draw() {
    src('whole', whole);
    src('walked', latest ? latest.walked : ${lineString([path[0]])});
    src('ahead', latest ? latest.ahead : whole);
    src('here', latest ? latest.here : start);
    src('start', start);
    src('end', end);
    src('arrows-wide', latest ? latest.wide : ${wideArrows});
    src('arrows-near', latest ? latest.near : ${nearArrows});

    // 길 밑에 흰 테. 밑그림의 길도 흰색이라 얇은 선만 얹으면 지워진 것처럼 보인다.
    line('casing', 'whole', PAPER, 7, { 'line-opacity': 0.9 });
    /*
     * 걷는 만큼 눈금이 실선으로 채워진다.
     *
     * 처음엔 걸어온 쪽을 옅은 회색으로 두고 "물러난다"고 했는데, 실기기에서
     * 옅은 회색 4px는 흰 도로 위에서 사실상 안 보였다 — 걷고 있는데 지도가
     * 가만히 있다는 피드백이 그래서 왔다. 내가 따라가는 모습이 보이려면
     * **자라나는 쪽이 진해야 한다.** 같은 기분 색이라도 실선과 눈금은 흘깃 봐도
     * 갈리고, 굵기를 한 단계 올려 눈금 위에 또렷하게 얹힌다.
     */
    line('walked', 'walked', TINT, 5);
    // 남은 길은 눈금으로 기다린다.
    line('ahead', 'ahead', TINT, 4, { 'line-dasharray': [2, 1.6] }, { 'line-cap': 'butt' });
    // 어느 쪽으로 걷는지. 선 위에 얹어야 보이므로 선보다 뒤에 얹는다.
    // 두 배율용 두 벌을 다 얹고 보기에 따라 하나만 켠다.
    fill('arrows-wide', 'arrows-wide', TINT, { 'fill-outline-color': PAPER });
    fill('arrows-near', 'arrows-near', TINT, { 'fill-outline-color': PAPER });

    // 출발은 비어 있고 도착은 차 있다. 어느 쪽으로 걷는지 한눈에 보이게.
    circle('start', 'start', 5, PAPER, FAINT, 2);
    circle('end', 'end', 6.5, TINT, PAPER, 2);
    /*
     * 지금 자리는 **고리**다. 도착점과 같은 크기의 채운 점으로 뒀더니 지도에
     * 같은 색 같은 크기의 원이 둘 놓여서, 어느 쪽이 '나'고 어느 쪽이 '갈 곳'인지
     * 구분이 안 됐다. 안을 비우면 위치 표시로 읽히고 채운 점은 목적지로 남는다.
     */
    circle('here', 'here', 6, PAPER, TINT, 4, {
      'circle-opacity': 0, 'circle-stroke-opacity': 0
    });

    applyView();

    var visible = latest ? 1 : 0;
    map.setPaintProperty('here', 'circle-opacity', visible);
    map.setPaintProperty('here', 'circle-stroke-opacity', visible);
  }

  map.on('styledata', draw);

  map.on('error', function () {
    // 스타일을 못 받았다. 종이 한 장 위에라도 경로는 보여준다.
    if (fellBack || map.isStyleLoaded()) { return; }
    fellBack = true;
    map.setStyle(BLANK);
  });

  window.__setProgress = function (walked, ahead, here, wide, near) {
    latest = { walked: walked, ahead: ahead, here: here, wide: wide, near: near };
    // 스타일이 아직이면 그냥 들고 있는다 — 'styledata'가 올 때 이 값으로 그린다.
    if (map.getLayer('here')) { draw(); }

    /*
     * 걷는 사람을 따라간다.
     *
     * 길 전체를 담고 있으면 한 걸음이 1픽셀도 안 되어 움직임이 보이지 않는다.
     * 처음 한 번은 길 전체를 보여 주고(생성 시 fitBounds), 첫 진행이 들어오면
     * 그 자리로 부드럽게 내려앉은 뒤로는 계속 붙어 다닌다.
     */
    if (!CAN_FOLLOW || !here || !here.geometry) { return; }
    var first = latestCenter == null;
    latestCenter = here.geometry.coordinates;
    // 전체 보기를 고른 사람을 걸음마다 끌어당기지 않는다.
    if (following) { showWalker(first ? 900 : 600); }
  };
}());
</script>
</body>
</html>`;
}

const createStyles = (colors: Palette, type: TypeScale) =>
  StyleSheet.create({
    // 지도는 면이라 이 앱에서 유일하게 칠해진 자리다. 모서리를 둥글려 종이 위에 얹는다.
    box: { overflow: 'hidden', borderRadius: 14, backgroundColor: colors.bg },
    // 아래 읽을거리가 쓰고 남은 높이를 전부 가져간다.
    fillBox: { flex: 1, overflow: 'hidden', borderRadius: 14, backgroundColor: colors.bg },
    web: { flex: 1, backgroundColor: colors.bg },
  });

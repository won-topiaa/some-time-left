import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import WebView from '@granite-js/native/react-native-webview';
import { getApiConfig } from '../config';
import { splitPath } from '../domain/geo';
import { MAPLIBRE_CSS, MAPLIBRE_JS, MAPLIBRE_LICENSE } from './vendor/maplibre';
import { colors } from './theme';
import type { LatLng } from '../domain/types';

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
export function RouteMapVector({
  path,
  height = 220,
  tint = colors.ink,
  progress,
}: {
  path: LatLng[];
  height?: number;
  tint?: string;
  progress?: number;
}) {
  const webView = useRef<WebView>(null);

  /*
   * HTML은 경로가 바뀔 때만 다시 만든다.
   *
   * 1MB짜리 문자열이라 걸음마다 새로 만들면 그 자체로 화면이 버벅인다.
   * 진행 상황은 아래에서 `injectJavaScript`로 밀어 넣는다 — 지도는 그대로 두고
   * 선 두 개만 갈아 끼우는 것이라 훨씬 가볍다.
   */
  const html = useMemo(() => mapHtml(path, tint), [path, tint]);

  const update = useMemo(() => (progress == null ? null : progressScript(path, progress)), [
    path,
    progress,
  ]);

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

  return (
    <View style={[styles.box, { height }]}>
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
function progressScript(path: LatLng[], progress: number): string {
  const split = splitPath(path, progress);
  if (split == null) {
    return 'true;';
  }
  return `window.__setProgress && window.__setProgress(
    ${lineString(split.walked)}, ${lineString(split.ahead)}, ${point(split.at)}
  ); true;`;
}

function mapHtml(path: LatLng[], tint: string): string {
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
  .maplibregl-ctrl-attrib { font-size: 10px; background: rgba(255,255,255,0.82); }
  .maplibregl-ctrl-bottom-left, .maplibregl-ctrl-logo { display: none; }
</style>
<script>${MAPLIBRE_JS}</script>
</head>
<body>
<div id="map"></div>
<script>
(function () {
  var TINT = ${JSON.stringify(tint)};
  var GHOST = ${JSON.stringify(colors.inkGhost)};
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

  var map = new maplibregl.Map({
    container: 'map',
    style: ${JSON.stringify(mapTiles.vectorStyleUrl)},
    // 손대지 못하게 둔다. 두 화면 모두 스크롤 안에 있어서 끌기가 겹친다.
    interactive: false,
    attributionControl: { compact: false },
    bounds: [[${bounds.west}, ${bounds.south}], [${bounds.east}, ${bounds.north}]],
    fitBoundsOptions: { padding: 24, animate: false }
  });

  var whole = ${lineString(path)};
  var start = ${point(start)};
  var end = ${point(end)};

  /** 마지막으로 받은 진행 상황. 스타일이 바뀌어도 이 값으로 다시 그린다. */
  var latest = null;
  var fellBack = false;

  function src(id, data) {
    if (map.getSource(id)) { map.getSource(id).setData(data); return; }
    map.addSource(id, { type: 'geojson', data: data });
  }

  function line(id, source, color, width, extra) {
    if (map.getLayer(id)) { return; }
    map.addLayer({ id: id, type: 'line', source: source,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: Object.assign({ 'line-color': color, 'line-width': width }, extra || {}) });
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

    // 길 밑에 흰 테. 밑그림의 길도 흰색이라 얇은 선만 얹으면 지워진 것처럼 보인다.
    line('casing', 'whole', PAPER, 7, { 'line-opacity': 0.9 });
    // 걸어온 길은 물러난다. 지운 게 아니라 지나온 것이므로 남겨는 둔다.
    line('walked', 'walked', GHOST, 4);
    // 남은 길이 주인공. 기분 색은 앞으로 갈 길에만 남는다.
    line('ahead', 'ahead', TINT, 4);

    // 출발은 비어 있고 도착은 차 있다. 어느 쪽으로 걷는지 한눈에 보이게.
    circle('start', 'start', 5, PAPER, FAINT, 2);
    circle('end', 'end', 6.5, TINT, PAPER, 2);
    // 지금 자리. 진행이 들어오기 전에는 안 보인다.
    circle('here', 'here', 5, TINT, PAPER, 3, {
      'circle-opacity': 0, 'circle-stroke-opacity': 0
    });

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

  window.__setProgress = function (walked, ahead, here) {
    latest = { walked: walked, ahead: ahead, here: here };
    // 스타일이 아직이면 그냥 들고 있는다 — 'styledata'가 올 때 이 값으로 그린다.
    if (map.getLayer('here')) { draw(); }
  };
}());
</script>
</body>
</html>`;
}

const styles = StyleSheet.create({
  // 지도는 면이라 이 앱에서 유일하게 칠해진 자리다. 모서리를 둥글려 종이 위에 얹는다.
  box: { overflow: 'hidden', borderRadius: 14, backgroundColor: colors.bg },
  web: { flex: 1, backgroundColor: colors.bg },
});

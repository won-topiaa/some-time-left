import { useMemo } from 'react';
import Svg, { Circle, Path } from '@granite-js/native/react-native-svg';
import { View, StyleSheet } from 'react-native';
import { colors } from './theme';
import { VIEWBOX, projectPath, splitAtRatio, toSvgPath } from './routeShape';
import type { LatLng } from '../domain/types';

/**
 * 경로 미리보기.
 *
 * 앱인토스 런타임에는 지도 네이티브 모듈이 없다(제공되는 모듈 목록에 없음).
 * 그래서 지도 타일 대신 경로의 '모양'만 리본으로 그린다.
 * 조용한 톤에도 오히려 맞고, 지도 SDK 의존도 없앨 수 있다.
 * 실제 지도가 필요해지면 WebView에 지도 JS SDK를 띄우는 방식으로 교체한다.
 *
 * 색은 기분에서 온다(`tint`). 크롬은 무채색으로 두고 색은 내용이 내는 원칙.
 */
export function RoutePreview({
  path,
  height = 180,
  tint = colors.ink,
  progress,
}: {
  path: LatLng[];
  height?: number;
  tint?: string;
  /**
   * 지금까지 온 만큼 (0~1). 주면 걸어온 길이 흐려지고 지금 자리에 점이 찍힌다.
   *
   * 걷는 화면이 이걸 준다. 선 하나만 있으면 어느 쪽으로 가는 중인지도 모르는데,
   * 갈라 놓으면 남은 선이 곧 앞으로 갈 길이 되어 따라갈 수 있는 그림이 된다.
   */
  progress?: number;
}) {
  const points = useMemo(() => projectPath(path), [path]);
  const d = useMemo(() => toSvgPath(points), [points]);
  const split = useMemo(
    () => (progress == null ? null : splitAtRatio(points, progress)),
    [points, progress]
  );

  if (points.length < 2) {
    return <View style={[styles.box, { height }]} />;
  }

  const start = points[0];
  const end = points[points.length - 1];

  return (
    <View style={[styles.box, { height }]}>
      {/* 비율을 지켜 그린다 — 늘리면 남북으로 곧은 길과 동서로 곧은 길이 같아 보인다. */}
      <Svg width="100%" height="100%" viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}>
        {split == null ? (
          <Path
            d={d}
            stroke={tint}
            strokeWidth={2.5}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <>
            {/* 걸어온 길은 물러난다. 지운 게 아니라 지나온 것이므로 남겨는 둔다. */}
            <Path
              d={toSvgPath(split.walked)}
              stroke={colors.inkGhost}
              strokeWidth={2.5}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* 남은 길이 이 화면의 주인공이다. 기분 색은 앞으로 갈 길에만 남는다. */}
            <Path
              d={toSvgPath(split.ahead)}
              stroke={tint}
              strokeWidth={2.5}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}
        {/* 출발은 비어 있고 도착은 차 있다. 어느 쪽으로 걷는지 한눈에 보이게. */}
        <Circle cx={start.x} cy={start.y} r={3} fill={colors.surface} stroke={colors.inkGhost} strokeWidth={1.5} />
        <Circle cx={end.x} cy={end.y} r={4} fill={tint} />
        {split != null && (
          <>
            {/* 지금 있는 자리. 종이 위에 얹힌 것처럼 테두리를 둘러 선과 구분한다. */}
            <Circle cx={split.at.x} cy={split.at.y} r={5.5} fill={colors.surface} />
            <Circle cx={split.at.x} cy={split.at.y} r={3.5} fill={tint} />
          </>
        )}
      </Svg>
    </View>
  );
}

/**
 * 기록 한 칸에 들어가는 작은 리본.
 *
 * 발자취의 도트 지도, Liltie의 앨범 아트가 하는 일을 우리 식으로 옮긴 것 —
 * 쌓였을 때 비로소 화면에 색과 무늬가 생기는 단위. 점과 굵기를 줄여
 * 작게 그려도 뭉치지 않게 한다.
 */
export function RouteGlyph({
  path,
  size = 64,
  tint = colors.inkFaint,
}: {
  path: LatLng[];
  size?: number;
  tint?: string;
}) {
  // 작은 그림에는 여백을 조금 더 줘야 선 끝이 모서리에 붙지 않는다.
  const points = useMemo(() => projectPath(path, 14), [path]);
  const d = useMemo(() => toSvgPath(points), [points]);

  if (points.length < 2) {
    return <View style={{ width: size, height: size }} />;
  }

  const end = points[points.length - 1];

  return (
    <View style={{ width: size, height: size }}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}>
        <Path
          d={d}
          stroke={tint}
          strokeWidth={5}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Circle cx={end.x} cy={end.y} r={6} fill={tint} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * 면을 칠하지 않는다.
   * 비율을 지켜 그리면서 흰 상자를 두면 리본 양옆에 죽은 여백이 생긴다.
   * 종이 위에 선만 남기는 편이 레퍼런스의 결에도 맞다.
   */
  box: { overflow: 'hidden' },
});

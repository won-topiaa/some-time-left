import { useMemo } from 'react';
import Svg, { Circle, Path } from '@granite-js/native/react-native-svg';
import { View } from 'react-native';
import { colors } from './theme';
import { VIEWBOX, projectPath, toSvgPath } from './routeShape';
import type { LatLng } from '../domain/types';

/*
 * 큰 리본(`RoutePreview`)은 없앴다.
 *
 * 경로 화면과 걷는 화면이 실제 지도(`RouteMap`)를 쓰게 되면서 쓰는 데가 없어졌다.
 * 여기 남은 글리프는 기록 한 칸에 들어가는 것이라 실제 위치가 필요 없다 —
 * 모아 놨을 때 서로 구분되는 무늬면 되고, 그 자리에 지도를 깔면 오히려 시끄럽다.
 */

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


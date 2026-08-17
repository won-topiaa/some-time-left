import { useMemo } from 'react';
import Svg, { Circle, Path } from '@granite-js/native/react-native-svg';
import { View, StyleSheet } from 'react-native';
import { colors, radius } from './theme';
import type { LatLng } from '../domain/types';

/**
 * 경로 미리보기.
 *
 * 앱인토스 런타임에는 지도 네이티브 모듈이 없다(제공되는 모듈 목록에 없음).
 * 그래서 지도 타일 대신 경로의 '모양'만 리본으로 그린다.
 * 조용한 톤에도 오히려 맞고, 지도 SDK 의존도 없앨 수 있다.
 * 실제 지도가 필요해지면 WebView에 지도 JS SDK를 띄우는 방식으로 교체한다.
 */
export function RoutePreview({
  path,
  height = 180,
}: {
  path: LatLng[];
  height?: number;
}) {
  const d = useMemo(() => toSvgPath(path), [path]);

  if (path.length < 2) {
    return <View style={[styles.box, { height }]} />;
  }

  return (
    <View style={[styles.box, { height }]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Path d={d} stroke={colors.accent} strokeWidth={2.5} fill="none" strokeLinecap="round" />
        <Circle cx={project(path, 0).x} cy={project(path, 0).y} r={3} fill={colors.inkFaint} />
        <Circle
          cx={project(path, path.length - 1).x}
          cy={project(path, path.length - 1).y}
          r={4}
          fill={colors.accent}
        />
      </Svg>
    </View>
  );
}

interface Bounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

function boundsOf(path: LatLng[]): Bounds {
  return path.reduce<Bounds>(
    (acc, p) => ({
      minLat: Math.min(acc.minLat, p.lat),
      maxLat: Math.max(acc.maxLat, p.lat),
      minLng: Math.min(acc.minLng, p.lng),
      maxLng: Math.max(acc.maxLng, p.lng),
    }),
    { minLat: Infinity, maxLat: -Infinity, minLng: Infinity, maxLng: -Infinity }
  );
}

const PADDING = 10;

function project(path: LatLng[], index: number): { x: number; y: number } {
  const b = boundsOf(path);
  const spanLat = Math.max(1e-6, b.maxLat - b.minLat);
  const spanLng = Math.max(1e-6, b.maxLng - b.minLng);
  const p = path[index];

  return {
    x: PADDING + ((p.lng - b.minLng) / spanLng) * (100 - PADDING * 2),
    // 위도는 위로 갈수록 커지므로 y축을 뒤집는다
    y: PADDING + (1 - (p.lat - b.minLat) / spanLat) * (100 - PADDING * 2),
  };
}

function toSvgPath(path: LatLng[]): string {
  if (path.length < 2) {
    return '';
  }
  return path
    .map((_, i) => {
      const { x, y } = project(path, i);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
});

import { useMemo, useState } from 'react';
import { Image, PixelRatio, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from '@granite-js/native/react-native-svg';
import { mapAttribution, mapView, tileUrl } from './mercator';
import { splitAtRatio, type Point } from './routeShape';
import { colors, radius, spacing, type } from './theme';
import { distanceM } from '../domain/geo';
import type { LatLng } from '../domain/types';

/**
 * 래스터 타일 지도 (CARTO Positron).
 *
 * 타일 이미지를 직접 깔고 그 위에 SVG로 경로를 그린다. 지도 SDK도 웹뷰도 없이
 * 웹 메르카토르 계산 하나면 되고, 그래서 가볍고 빠르다.
 *
 * **키 없이 받아진다**(실측). 다만 CARTO 문서는 무료 키를 요구하고 상업적 사용에
 * 별도 라이선스를 둔다 — 조건이 걸리면 `config.mapTiles.kind`를 'vector'로 바꾼다
 * (`RouteMapVector`, OpenFreeMap).
 *
 * 타일이 안 오면(비행기 모드, 네트워크 차단) 이미지만 비고 경로는 그대로 그려진다.
 * 지도가 없다고 걷는 화면이 죽지는 않는다.
 */
export function RouteMapRaster({
  path,
  height = 220,
  tint = colors.ink,
  progress,
}: {
  path: LatLng[];
  height?: number;
  tint?: string;
  /** 지금까지 온 만큼 (0~1). 주면 걸어온 길이 흐려지고 지금 자리에 점이 찍힌다. */
  progress?: number;
}) {
  /**
   * 폭은 재서 안다. 지도는 화면 폭을 꽉 채우는데, 그 값을 상수로 적어 두면
   * 기기마다 경로가 상자 밖으로 나가거나 한쪽으로 쏠린다.
   */
  const [width, setWidth] = useState(0);

  /*
    기기 화소 밀도를 넘긴다. 이걸로 타일 한 장이 실제 화소 512(우리가 받는 `@2x`
    원본 크기)에 가장 가깝게 놓이는 배율이 정해진다 — 늘어나 흐려지지도, 줄어들어
    글자가 안 읽히지도 않는 지점이다.
  */
  const pixelRatio = PixelRatio.get();
  const view = useMemo(
    () => mapView(path, { width, height, pixelRatio }),
    [path, width, height, pixelRatio]
  );

  const points = useMemo(
    () => (view == null ? [] : path.map((at) => view.project(at))),
    [view, path]
  );

  const split = useMemo(() => {
    if (progress == null || points.length < 2) {
      return null;
    }
    // 진행 비율은 미터로 잰 값이라(walkProgress) 구간 길이도 미터로 재야 한다.
    const segmentM = path.slice(1).map((point, i) => distanceM(path[i], point));
    return splitAtRatio(points, progress, segmentM);
  }, [points, path, progress]);

  return (
    <View
      style={[styles.box, { height }]}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {view?.tiles.map((tile) => (
        <Image
          key={`${tile.zoom}/${tile.x}/${tile.y}`}
          source={{ uri: tileUrl(tile) }}
          style={[
            styles.tile,
            // 크기는 판마다 다르다 — 소수 배율을 메우느라 TILE_SIZE보다 커질 수 있다.
            { left: tile.left, top: tile.top, width: view.tilePx, height: view.tilePx },
          ]}
          // 타일은 이미 그릴 크기 그대로다. 늘리거나 자를 여지를 두지 않는다.
          resizeMode="cover"
        />
      ))}

      {points.length >= 2 && (
        <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
          {/*
            길 밑에 흰 테를 한 겹 깐다. Positron의 길도 흰색이라 그 위에 얇은 선을
            그대로 얹으면 골목 위에서 경로가 지워진 것처럼 보인다.
          */}
          <Path d={toPath(points)} stroke={colors.surface} strokeWidth={7} fill="none"
                strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />

          {split == null ? (
            <Path d={toPath(points)} stroke={tint} strokeWidth={4} fill="none"
                  strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <>
              {/* 걸어온 길은 물러난다. 지운 게 아니라 지나온 것이므로 남겨는 둔다. */}
              <Path d={toPath(split.walked)} stroke={colors.inkGhost} strokeWidth={4} fill="none"
                    strokeLinecap="round" strokeLinejoin="round" />
              {/* 남은 길이 주인공. 기분 색은 앞으로 갈 길에만 남는다. */}
              <Path d={toPath(split.ahead)} stroke={tint} strokeWidth={4} fill="none"
                    strokeLinecap="round" strokeLinejoin="round" />
            </>
          )}

          {/* 출발은 비어 있고 도착은 차 있다. 어느 쪽으로 걷는지 한눈에 보이게. */}
          <Circle cx={points[0].x} cy={points[0].y} r={5}
                  fill={colors.surface} stroke={colors.inkFaint} strokeWidth={2} />
          <Circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={6.5}
                  fill={tint} stroke={colors.surface} strokeWidth={2} />

          {split != null && (
            <>
              <Circle cx={split.at.x} cy={split.at.y} r={8} fill={colors.surface} />
              <Circle cx={split.at.x} cy={split.at.y} r={5} fill={tint} />
            </>
          )}
        </Svg>
      )}

      {/*
        지우지 않는다. OpenStreetMap(ODbL)과 CARTO 둘 다 표기를 요구한다.
        가장 작고 옅게, 그러나 읽을 수 있게.
      */}
      {view != null && <Text style={styles.credit}>{mapAttribution()}</Text>}
    </View>
  );
}

function toPath(points: Point[]): string {
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
}

const styles = StyleSheet.create({
  // 지도는 면이라 이 앱에서 유일하게 칠해진 자리다. 모서리를 둥글려 종이 위에 얹는다.
  box: { overflow: 'hidden', borderRadius: 14, backgroundColor: colors.bg },
  tile: { position: 'absolute' },
  /*
    지워서도, 안 보이게 해서도 안 된다. OSM(ODbL)과 CARTO 둘 다 표기를 요구한다.

    10px에 inkFaint로 뒀다가 고쳤다 — 이 앱은 11px에 inkFaint를 이미 한 번 시험하고
    "화면에서 안 읽힌다"고 버렸는데(`theme.ts`), 그보다 더 흐린 글씨를 하필 무늬가
    많은 타일 위에 얹고 있었다. 크기를 되돌리고, 흰 바탕을 깔아 지도와 분리한다.
  */
  credit: {
    position: 'absolute',
    right: spacing.xs,
    bottom: spacing.xs,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.82)',
    ...type.caption,
    fontSize: 11,
    lineHeight: 16,
    color: colors.inkSoft,
  },
});

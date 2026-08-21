import { getApiConfig } from '../config';
import { RouteMapRaster } from './RouteMapRaster';
import { RouteMapVector } from './RouteMapVector';
import type { LatLng } from '../domain/types';

/**
 * 실제 지도 위의 경로.
 *
 * 두 판이 있고 `config.mapTiles.kind`가 고른다.
 *
 * | | 타일 | 그리는 쪽 | 무게 | 조건 |
 * |---|---|---|---|---|
 * | `raster` | CARTO Positron | 우리가 직접(SVG) | 가볍다 | 문서상 키를 요구, 상업적 사용은 별도 라이선스 |
 * | `vector` | OpenFreeMap Positron | 웹뷰 안 MapLibre | 웹뷰 하나 + 번들 1MB | 키·등록·한도·상업적 제한 전부 없음 |
 *
 * 보이는 그림은 거의 같다. 둘 다 옅은 회색 면과 흰 길뿐이라 이 앱의 종이빛 바탕
 * 위에 그대로 얹히고, 색을 가진 건 그 위의 경로 하나가 된다 —
 * 크롬은 무채색으로 두고 색은 내용이 낸다는 원칙 그대로다.
 *
 * 부르는 쪽은 어느 판인지 몰라도 된다. 그게 이 파일이 있는 이유다.
 */
export function RouteMap(props: {
  path: LatLng[];
  height?: number;
  tint?: string;
  /** 지금까지 온 만큼 (0~1). 주면 걸어온 길이 흐려지고 지금 자리에 점이 찍힌다. */
  progress?: number;
}) {
  const { mapTiles } = getApiConfig();

  if (mapTiles.kind === 'vector') {
    return <RouteMapVector {...props} />;
  }
  return <RouteMapRaster {...props} />;
}

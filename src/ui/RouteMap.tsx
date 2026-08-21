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
 *
 * **지금은 두 판의 무게를 다 치른다.** 메트로는 안 쓰는 가지를 털어내지 않아서,
 * `kind`가 'raster'여도 MapLibre 1.1MB가 번들에 들어간다(1.37MB → 2.5MB).
 * 나란히 두는 건 실기기에서 골라 보려는 임시 상태다 — 샌드박스에서 정하고 나면
 * 진 쪽을 지우고, 그때 무게도 같이 빠진다.
 */
export function RouteMap(props: {
  path: LatLng[];
  height?: number;
  tint?: string;
  /** 지금까지 온 만큼 (0~1). 주면 걸어온 길이 흐려지고 지금 자리에 점이 찍힌다. */
  progress?: number;
}) {
  const { mapTiles } = getApiConfig();

  /*
   * 좌표가 모자라면 아무 판도 만들지 않는다.
   *
   * 경로 화면은 길이 있으면 무조건 이걸 부르는데, 길이 늘 두 점 이상인 건 아니다 —
   * 티맵 응답이 비면 최단 경로가 빈 좌표열로 온다. 여기서 안 막으면 그때
   * 화면이 통째로 죽는다. 부르는 쪽마다 같은 검사를 두느니 한 군데서 막는다.
   */
  if (props.path.length < 2) {
    return null;
  }

  if (mapTiles.kind === 'vector') {
    return <RouteMapVector {...props} />;
  }
  return <RouteMapRaster {...props} />;
}

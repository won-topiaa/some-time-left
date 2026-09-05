import { getApiConfig } from '../config';
import { RouteMapRaster } from './RouteMapRaster';
import { RouteMapVector } from './RouteMapVector';
import type { LatLng, MoodId } from '../domain/types';

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
  /**
   * 남은 높이를 다 쓴다. 걷는 화면처럼 **지도가 주인공**일 때.
   *
   * 벡터판만 이걸 지킨다. 래스터판은 타일을 깔 자리를 높이 숫자에서 직접 계산해서
   * 늘어나는 상자를 받을 수 없다 — 지금 출하되는 건 벡터판이라(`kind: 'vector'`)
   * 래스터에 측정 로직을 새로 넣지 않고, 그쪽은 고정 높이로 둔다.
   */
  fill?: boolean;
  /**
   * 기분. 주면 각 판이 **자기 바탕에 맞는** 색을 직접 고른다.
   *
   * `tint`만 받던 때는 부르는 쪽이 앱 테마로 색을 정해 넘겼는데, 벡터 지도는
   * 어두운 테마에서도 밝은 타일을 쓰기 때문에 그 색이 흰 도로 위의 옅은
   * 파스텔이 됐다. 어떤 바탕 위에 그리는지는 판이 아는 일이라 이쪽으로 옮긴다.
   */
  moodId?: MoodId;
  tint?: string;
  /**
   * 지금까지 온 만큼 (0~1). 주면 걸어온 만큼이 실선으로 채워지고 남은 길은 눈금으로
   * 남으며, 그 경계에 지금-자리 고리가 찍힌다. (래스터판은 아직 옛 방식 — 걸어온
   * 쪽을 흐리게 둔다. 출하되는 건 벡터판이다.)
   */
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
  // 래스터판은 CARTO의 어두운 짝을 실제로 쓰므로 앱 테마 색을 그대로 받는다.
  const { fill, moodId, ...raster } = props;
  return <RouteMapRaster {...raster} />;
}

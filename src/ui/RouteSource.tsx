import { StyleSheet, Text } from 'react-native';
import { spacing } from './theme';
import { type Palette, type TypeScale, useStyles } from './useTheme';

/**
 * 이 길을 누가 찾아 줬는지.
 *
 * 지도 **타일**의 출처는 MapLibre가 스타일 문서를 읽어 알아서 적는다. 그런데
 * **경로**의 출처는 그것과 별개다. 키 없이 쓰는 OSRM(FOSSGIS)은 운영 정책으로
 * 경로 출처 표기를 요구한다 — 남의 무료 서버에 얹혀 가는 값이라 지우지 않는다.
 *
 * 한 조각으로 묶어 둔 이유: 같은 경로가 길 고르는 화면·걷는 화면·기록 화면
 * 세 곳에 그려진다. 처음엔 길 고르는 화면에만 붙였는데, 나머지 두 곳에서는
 * 같은 좌표를 출처 없이 보여주고 있었다. 규칙이 한 군데 있어야 그런 구멍이 안 생긴다.
 *
 * TMAP으로 받은 날은 우리 몫의 할당량이라 아무것도 적지 않는다 — 화면에
 * 군더더기를 늘리지 않는다.
 */
export function RouteSource({ routeId }: { routeId: string | null | undefined }) {
  const styles = useStyles(createStyles);

  // 공급자는 routeId의 접두사가 말해 준다(`road-route-provider.ts`의 `routeIdOf`).
  if (routeId == null || !routeId.startsWith('osrm-')) {
    return null;
  }

  return <Text style={styles.source}>경로 OSRM · OpenStreetMap</Text>;
}

const createStyles = (colors: Palette, type: TypeScale) =>
  StyleSheet.create({
    /**
     * 의무 표기다. 화면에서 가장 조용하되 **읽히기는 해야 한다** —
     * 한때 `inkGhost`(대비 1.4:1)로 뒀는데 그건 빈 자리를 표시하는 색이라
     * 사실상 안 보였다. 읽히지 않는 표기는 표기가 아니다.
     */
    source: { ...type.caption, color: colors.inkFaint, marginTop: spacing.sm },
  });

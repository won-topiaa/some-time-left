/**
 * 약속까지 남은 시간을 선 하나로.
 *
 * 시각을 적으면 "오늘 오후 1시 20분"이라고만 되돌려 주던 자리다. 맞는 말이지만
 * 그 줄로는 이 앱이 무엇을 하는 앱인지 알 수 없었다 — 추신을 읽어야만 알았다.
 * 남은 시간을 그려 두면 읽지 않은 사람도 자기 자투리가 얼마인지 그 자리에서 본다.
 *
 * 도막 셋을 그대로 늘어놓는다(`spareSpan`). 비율은 flex가 낸다 — 초 단위를 그대로
 * flex 값으로 주면 도막 길이가 곧 시간이다.
 */

import { StyleSheet, Text, View } from 'react-native';
import { formatClock } from '../domain/time';
import { canWalk, isFloor, type SpareSpan } from '../domain/spare-time';
import { spacing } from './theme';
import { type Palette, type TypeScale, useStyles } from './useTheme';

export function SpareLine({
  span,
  nowMs,
  arriveAtMs,
}: {
  span: SpareSpan;
  nowMs: number;
  arriveAtMs: number;
}) {
  const styles = useStyles(createStyles);
  const walkMin = Math.round(span.walkSec / 60);

  return (
    <View style={styles.wrap}>
      <View style={styles.ends}>
        <Text style={styles.endLabel}>지금 {formatClock(nowMs)}</Text>
        <Text style={styles.endLabel}>약속 {formatClock(arriveAtMs)}</Text>
      </View>

      {/*
        점 두 개 사이에 도막 셋. 도막에 초를 그대로 flex로 주므로 길이가 곧 시간이다.

        걷는 도막에만 색이 남는다 — 이 앱에서 색은 크롬이 아니라 내용이 내고,
        여기서 내용은 '걸을 수 있는 시간' 하나다. 기다림과 약속 앞 여백은
        헤어라인으로 물러난다.
      */}
      <View style={styles.track}>
        <View style={styles.dot} />
        {span.waitSec > 0 && <View style={[styles.rest, { flex: span.waitSec }]} />}
        {span.walkSec > 0 && <View style={[styles.walk, { flex: span.walkSec }]} />}
        {span.bufferSec > 0 && <View style={[styles.rest, { flex: span.bufferSec }]} />}
        <View style={styles.dot} />
      </View>

      {/*
        선만 있으면 무엇을 나눈 선인지 모른다. 걷는 도막이 무엇인지 한 줄로 말한다.
        걸을 자리가 없는 날은 그 사실을 말한다 — 0분이라고 적어 두면 선이
        거짓말처럼 보인다.
      */}
      {canWalk(span) ? (
        <Text style={styles.caption}>
          이 중에 <Text style={styles.captionStrong}>{walkMin}분</Text>
          {/*
            상한에 걸린 날은 '이상'이다. 여기서 아는 건 절대 상한뿐이고 실제 계획은
            최단 경로에 따라 더 길어질 수 있어서, 딱 잘라 말하면 다음 화면이
            더 긴 길을 내놓을 때 이 줄이 틀린 말이 된다.
          */}
          {isFloor(span) ? ' 이상 걸을 수 있어요' : '을 걸을 수 있어요'}
        </Text>
      ) : (
        <Text style={styles.caption}>지금 바로 나서야 하는 시간이에요</Text>
      )}
    </View>
  );
}

const createStyles = (colors: Palette, type: TypeScale) =>
  StyleSheet.create({
    wrap: { marginTop: spacing.md },
    ends: { flexDirection: 'row', justifyContent: 'space-between' },
    endLabel: { ...type.caption, color: colors.inkFaint },
    track: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: spacing.sm,
      // 가장 두꺼운 자식(점)이 높이를 정한다. 도막만 있으면 선이 얇아 눌린다.
      height: 7,
    },
    dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.inkFaint },
    /** 걷지 않는 시간. 있다는 것만 보이면 된다. */
    rest: { height: 1, backgroundColor: colors.line },
    /** 걷는 시간. 이 화면에서 색이 있는 유일한 자리다. */
    walk: { height: 3, borderRadius: 2, backgroundColor: colors.accent },
    caption: { ...type.caption, color: colors.inkSoft, marginTop: spacing.sm },
    captionStrong: { color: colors.ink, fontWeight: '600' },
  });

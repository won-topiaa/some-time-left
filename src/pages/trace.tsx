import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { createRoute, useNavigation } from '@granite-js/react-native';
import { NO_CARRIED, loadCarried, loadRecords, type CarriedTotals } from '../data/records';
import { formatRecordDate, formatTotalDistance, groupByMonth, traceSummary } from '../domain/trace';
import { moodById } from '../domain/mood';
import { spacing } from '../ui/theme';
import { type Palette, type TypeScale, useStyles, useTheme } from '../ui/useTheme';
import { useScreenInsets } from '../ui/screenInsets';
import { moodTint } from '../ui/moodTint';
import { RouteGlyph } from '../ui/RoutePreview';
import { isWalkablePath } from '../domain/route-sanity';
import { openRecord } from './record';
import type { WalkRecord } from '../domain/types';

export const Route = createRoute('/trace', {
  component: Trace,
});

/** 글리프 한 칸의 크기와 개수. 한 줄에 네 개가 들어가는 크기로 맞춘다. */
const GLYPH = 64;
const GRID_MIN = 4;
const GRID_MAX = 24;

/** 아래 목록에 그릴 최대 개수. 그 위로는 숫자로만 알린다. */
const LIST_MAX = 60;

/**
 * 지나온 길.
 *
 * 기록을 저장만 하고 보여주지 않으면 그건 기록이 아니라 로그다.
 * 발자취가 누적 거리를, Liltie가 채워진 날들을 첫 화면에 크게 두는 이유가 그것이고,
 * 이 화면이 이 앱에서 유일하게 '쌓이는' 화면이다.
 *
 * 색은 여기서만 진해진다. 기분 색을 띤 길들이 모여야 비로소 화면에 색이 생긴다 —
 * 한 번 걸었을 땐 거의 무채색이고, 여러 번 걸어야 알록달록해진다.
 */
function Trace() {
  const { scheme } = useTheme();
  const styles = useStyles(createStyles);
  const navigation = useNavigation();
  const screen = useScreenInsets();
  const [records, setRecords] = useState<WalkRecord[] | null>(null);
  // 목록에서 밀려난 옛 기록들의 합. 낱낱은 없어도 누적 숫자에는 남아 있어야 한다.
  const [carried, setCarried] = useState<CarriedTotals>(NO_CARRIED);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      // 저장된 값이 배열이 아니면 정렬에서 터진다. 기록을 못 읽는 것이
      // 영영 빈 화면이 될 이유는 없으니 없는 셈 치고 화면은 살려 둔다.
      loadRecords().catch(() => []),
      loadCarried().catch(() => NO_CARRIED),
    ]).then(([loaded, totals]) => {
      if (!cancelled) {
        setRecords(Array.isArray(loaded) ? loaded : []);
        setCarried(totals);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 훅은 조건부 return보다 위에 있어야 한다. 아래로 내리면 첫 렌더(records == null)와
  // 기록이 실린 렌더의 훅 개수가 달라져 "Rendered more hooks than during the previous
  // render"로 화면이 죽는다 — 기록이 한 건이라도 생기는 순간부터 이 화면 전체가 못 열린다.
  const loaded = records ?? [];
  const summary = useMemo(() => traceSummary(loaded, carried), [loaded, carried]);
  const months = useMemo(() => groupByMonth(loaded.slice(0, LIST_MAX)), [loaded]);
  const emptyCount = Math.max(0, GRID_MIN - loaded.length);
  const emptySlots = useMemo(() => Array.from({ length: emptyCount }, (_, i) => i), [emptyCount]);
  // 아래 목록에 안 그린 것 + 목록에서 아예 밀려난 것. 둘 다 위 숫자에는 들어 있다.
  const hidden = Math.max(0, loaded.length - LIST_MAX) + carried.count;

  // 불러오는 사이 빈 화면을 '기록 없음'으로 잘못 보여주지 않는다.
  if (records == null) {
    return <View style={styles.screen} />;
  }

  if (records.length === 0 && carried.count === 0) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: screen.top, paddingBottom: screen.bottom }]}>
        <Text style={styles.emptyTitle}>아직 걸은 길이 없어요.</Text>
        <Text style={styles.emptyBody}>
          한 번 걷고 나면{'\n'}여기에 그 길의 모양이 남아요.
        </Text>
        <Pressable
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          onPress={() => navigation.navigate('/')}
        >
          <Text style={styles.backText}>돌아가기</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: screen.top, paddingBottom: screen.bottom + spacing.xl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* 주인공은 숫자 하나. 목표가 아니라 사실이라 단위는 작게 붙인다. */}
      <Text style={styles.label}>지금까지 걸은 길</Text>
      <View style={styles.numeralRow}>
        <Text style={styles.numeral}>{formatTotalDistance(summary.totalDistanceM)}</Text>
        <Text style={styles.unit}>km</Text>
      </View>
      {/*
        한 줄을 안 남긴 사람에게 "0번 남겼어요"라고 하지 않는다. 비문이기도 하고,
        쌓인 걸 보러 온 화면의 첫 문장이 안 한 일을 세는 문장이 되면 안 된다.
      */}
      <Text style={styles.micro}>
        {summary.noteCount === 0
          ? `${summary.count}번 걸었어요`
          : `${summary.count}번 걸었고, ${summary.noteCount}번 한 줄을 남겼어요`}
      </Text>

      {/*
        길들을 모아 놓은 자리.
        레퍼런스 여섯 앱은 회고를 목록으로 두지 않는다 — 발자취는 지도의 빈 곳을 보게 하고
        Catch!는 병을 흔들게 한다. 우리에게 그 그릇은 '길의 모양들'이다.
        아래 목록이 사실을 말한다면, 여기는 한눈에 보이는 무늬를 말한다.
      */}
      <View style={styles.grid}>
        {/*
          그릴 수 없는 모양은 안 그린다.

          좌표를 지어내던 시절의 기록이 기기에 남아 있고, 그대로 그리면 그때의
          삼각형이 무늬로 남는다. 그 산책은 실제로 있었으므로 자리는 지키되,
          걷지 않은 모양을 '걸은 무늬'라고 내놓지는 않는다.
          (`RouteGlyph`는 그릴 게 없으면 빈 칸을 낸다)
        */}
        {records.slice(0, GRID_MAX).map((record) => (
          <RouteGlyph
            key={record.id}
            path={isWalkablePath(record.path) ? record.path : []}
            tint={moodTint(record.mood, scheme)}
            size={GLYPH}
          />
        ))}
        {/* 아직 빈 자리는 비워 두되 보이게 둔다. 채우라고 재촉하지는 않는다. */}
        {emptySlots.map((i) => (
          <View key={`empty-${i}`} style={styles.emptySlot}>
            <View style={styles.emptyDot} />
          </View>
        ))}
      </View>

      {months.map((month) => (
        <View key={month.key} style={styles.month}>
          <Text style={styles.monthLabel}>{month.label}</Text>

          {month.records.map((record) => {
            const tint = moodTint(record.mood, scheme);
            return (
              /*
                눌러서 그날을 다시 본다.

                리본은 무늬라 한눈에 모아 보기엔 좋지만 그날 어디를 걸었는지는
                말해주지 않는다. 누르면 같은 길이 실제 지도 위에 다시 깔린다.
              */
              <Pressable
                key={record.id}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                onPress={() => {
                  openRecord(record.id);
                  navigation.navigate('/record');
                }}
              >
                <RouteGlyph path={isWalkablePath(record.path) ? record.path : []} tint={tint} />

                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {record.destinationName !== '' ? record.destinationName : '어딘가'}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {formatRecordDate(record.arrivedAt)}
                    {record.companion.trim() !== '' && ` · ${record.companion}`}
                    {` · ${moodById(record.mood).label}`}
                  </Text>
                  {/* 남긴 말이 있으면 그게 이 줄의 주인공이다. tash처럼 글이 곧 디자인. */}
                  {record.note.trim() !== '' && (
                    <Text style={styles.rowNote}>{record.note}</Text>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}

      {hidden > 0 && (
        <Text style={styles.hidden}>그 전에 걸은 {hidden}번은 위 숫자에만 담겨 있어요.</Text>
      )}

      <Pressable
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        onPress={() => navigation.navigate('/')}
      >
        <Text style={styles.backText}>돌아가기</Text>
      </Pressable>
    </ScrollView>
  );
}

const createStyles = (colors: Palette, type: TypeScale) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    content: { paddingHorizontal: spacing.lg },
    center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },

    label: { ...type.caption, color: colors.inkSoft },
    numeralRow: { flexDirection: 'row', alignItems: 'flex-end' },
    numeral: { ...type.numeral, color: colors.ink },
    unit: { ...type.caption, color: colors.inkFaint, marginLeft: spacing.xs, marginBottom: spacing.sm },
    micro: { ...type.caption, color: colors.inkFaint, marginTop: spacing.xs },
    hidden: { ...type.caption, color: colors.inkFaint, marginTop: spacing.lg },

    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.lg,
    },
    /**
     * 채워지지 않은 자리.
     *
     * 자리는 지키되 존재를 주장하지 않는다. 흰 원에 테두리를 두르면 64px짜리 면이 생겨
     * 정작 주인공인 길 모양들보다 눈에 띄고, "면이 아니라 선과 여백"이라는 원칙도 깨진다.
     * 가운데 아주 작은 점 하나로 "여기 아직 안 채워짐"만 알린다.
     */
    emptySlot: {
      width: GLYPH,
      height: GLYPH,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyDot: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.inkGhost,
    },

    month: { marginTop: spacing.xl },
    monthLabel: {
      ...type.caption,
      color: colors.inkSoft,
      paddingBottom: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
    },

    // 면을 채우지 않는다. 헤어라인과 여백만으로 나눈다.
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
    },
    rowBody: { flex: 1, paddingTop: spacing.xs },
    rowTitle: { ...type.body, color: colors.ink },
    // 11px 회색은 읽히지 않는다. 곁다리 정보라도 읽을 수는 있어야 한다.
    rowMeta: { ...type.caption, color: colors.inkFaint, marginTop: 2 },
    rowNote: { ...type.body, color: colors.inkSoft, marginTop: spacing.sm },

    emptyTitle: { ...type.title, color: colors.ink, textAlign: 'center' },
    emptyBody: {
      ...type.body,
      color: colors.inkFaint,
      textAlign: 'center',
      marginTop: spacing.sm,
    },

    back: { marginTop: spacing.xl, paddingVertical: spacing.md, alignItems: 'center' },
    backText: { ...type.body, color: colors.inkSoft },
    pressed: { opacity: 0.6 },
  });

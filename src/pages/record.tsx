/**
 * 기록 하나를 다시 보는 화면.
 *
 * '지나온 길'의 리본은 무늬라서 한눈에 모아 보기엔 좋지만, **그날 어디를 걸었는지**는
 * 말해주지 않는다. 여기서는 같은 길을 실제 지도 위에 다시 깐다 — 리본이 모양이라면
 * 이 화면은 장소다.
 *
 * 새 이동을 시작하지 않는다. 지나온 것을 보는 자리에 "이 길로 갈게요"가 있으면
 * 회고가 아니라 또 하나의 입구가 된다.
 */

import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View, StyleSheet } from 'react-native';
import { createRoute, useNavigation } from '@granite-js/react-native';
import { share } from '@apps-in-toss/framework';
import { loadRecords } from '../data/records';
import { walkShareText } from '../domain/copy';
import { formatRecordDate } from '../domain/trace';
import { moodById } from '../domain/mood';
import { pathLengthM } from '../domain/geo';
import { RouteMap } from '../ui/RouteMap';
import { RouteSource } from '../ui/RouteSource';
import { isWalkablePath } from '../domain/route-sanity';
import { moodTint } from '../ui/moodTint';
import { spacing, radius } from '../ui/theme';
import { type Palette, type TypeScale, useStyles, useTheme } from '../ui/useTheme';
import { useScreenInsets } from '../ui/screenInsets';
import type { WalkRecord } from '../domain/types';

export const Route = createRoute('/record', {
  component: RecordDetail,
  // 토스 내비게이션 바의 뒤로가기와 겹치지 않게 라우터 기본 헤더는 끈다.
  screenOptions: { headerShown: false },
});

function RecordDetail() {
  const navigation = useNavigation();
  const { colors, scheme } = useTheme();
  const styles = useStyles(createStyles);
  const screen = useScreenInsets();

  /**
   * 어느 기록인가.
   *
   * 라우터 파라미터 대신 "가장 최근에 연 기록"을 상태로 들고 오는 대신, 목록이
   * 넘겨준 id로 찾는다. 기록은 그리 많지 않아(최대 수십 개) 목록을 한 번 읽어
   * 찾는 편이, 좌표까지 담긴 큰 객체를 화면 사이로 나르는 것보다 낫다.
   */
  const [record, setRecord] = useState<WalkRecord | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    loadRecords()
      .then((records) => {
        if (cancelled) {
          return;
        }
        const id = openedRecordId;
        const found = records.find((r) => r.id === id) ?? null;
        setRecord(found);
        setMissing(found == null);
      })
      .catch(() => {
        if (!cancelled) {
          setMissing(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (missing) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: screen.top }]}>
        <Text style={styles.gone}>그 기록을 찾지 못했어요.</Text>
        <Pressable
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          onPress={() => navigation.navigate('/trace')}
        >
          <Text style={styles.backText}>지나온 길로</Text>
        </Pressable>
      </View>
    );
  }

  if (record == null) {
    return <View style={[styles.screen, { paddingTop: screen.top }]} />;
  }

  const tint = moodTint(record.mood, scheme);
  const distanceM = record.distanceM ?? pathLengthM(record.path);

  return (
    <View style={[styles.screen, { paddingTop: screen.top }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: screen.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.date}>{formatRecordDate(record.arrivedAt)}</Text>
        <Text style={styles.title}>
          {record.destinationName !== '' ? record.destinationName : '어딘가'}
        </Text>

        {/*
          지도는 좌표가 진짜 길일 때만 깐다.

          좌표를 지어내던 시절의 기록이 기기에 남아 있다. 그걸 실제 지도 위에
          그리면 산자락을 가로지르는 삼각형이 오늘 다시 뜬다 — 고쳤다면서 같은
          거짓말을 되풀이하는 셈이다. 그날 걸은 것은 사실이므로 기록은 지우지
          않고, **그릴 수 없는 모양일 때만 지도를 접는다.**
        */}
        {isWalkablePath(record.path) ? (
          <>
            <View style={styles.map}>
              <RouteMap path={record.path} height={260} tint={tint} />
            </View>
            <RouteSource routeId={record.routeId} />
          </>
        ) : (
          <Text style={styles.noMap}>이 날의 경로는 다시 그릴 수 없어요.</Text>
        )}

        {/* 그날의 사실들. 숫자 하나가 주인공이고 나머지는 곁에 붙는다. */}
        <View style={styles.meta}>
          <Text style={styles.numeral}>{(distanceM / 1000).toFixed(2)}</Text>
          <Text style={styles.unit}>km</Text>
        </View>
        <Text style={styles.facts}>
          {moodById(record.mood).label}
          {record.companion.trim() !== '' && ` · ${record.companion}`}
        </Text>

        {/* 남긴 말이 있으면 그게 이 화면의 주인공이다. */}
        {record.note.trim() !== '' && <Text style={styles.note}>{record.note}</Text>}

        <Pressable
          style={({ pressed }) => [styles.shareButton, pressed && styles.pressed]}
          onPress={() => {
            // 실패해도 아무 말 안 한다. 공유 시트를 닫은 것도 실패로 오므로,
            // 여기서 오류를 띄우면 취소한 사람에게 사과하게 된다.
            share({ message: walkShareText(record, distanceM) }).catch(() => {});
          }}
        >
          <Text style={styles.shareText}>이 길 공유하기</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          onPress={() => navigation.navigate('/trace')}
        >
          <Text style={styles.backText}>지나온 길로</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

/**
 * 목록이 넘겨주는 기록 id.
 *
 * granite 라우터의 파라미터를 쓰지 않는다. 이 화면은 목록에서만 열리고, 딥링크로
 * 남의 기록을 열 수 있어야 할 이유도 없다 — 스킴으로 직접 들어오면 아래 '찾지
 * 못했어요'가 받는다. 모듈 변수 하나가 이 관계를 가장 정직하게 나타낸다.
 */
let openedRecordId: string | null = null;

export function openRecord(id: string): void {
  openedRecordId = id;
}

const createStyles = (colors: Palette, type: TypeScale) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
    center: { alignItems: 'center', justifyContent: 'center' },
    content: { paddingTop: spacing.md },
    date: { ...type.caption, color: colors.inkFaint },
    title: { ...type.title, color: colors.ink, marginTop: spacing.xs },
    map: { marginTop: spacing.lg },
    /** 지도를 접었을 때의 한 줄. 사과가 아니라 사실이라 가장 옅게 둔다. */
    noMap: { ...type.caption, color: colors.inkFaint, marginTop: spacing.lg },
    meta: { flexDirection: 'row', alignItems: 'flex-end', marginTop: spacing.lg },
    numeral: { ...type.numeral, fontSize: 44, lineHeight: 52, color: colors.ink },
    unit: {
      ...type.caption,
      color: colors.inkFaint,
      marginLeft: spacing.xs,
      marginBottom: spacing.sm,
    },
    facts: { ...type.caption, color: colors.inkSoft, marginTop: spacing.xs },
    // 남긴 말은 헤어라인 위에 얹는다. 면을 칠하지 않는다는 원칙 그대로.
    note: {
      ...type.body,
      color: colors.ink,
      marginTop: spacing.lg,
      paddingTop: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: colors.line,
    },
    shareButton: {
      marginTop: spacing.xl,
      paddingVertical: spacing.md,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: 'center',
    },
    shareText: { ...type.body, color: colors.inkSoft },
    gone: { ...type.title, color: colors.ink, textAlign: 'center' },
    back: { paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.sm },
    backText: { ...type.caption, color: colors.inkFaint },
    pressed: { opacity: 0.6 },
  });

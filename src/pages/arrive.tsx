import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { createRoute, useKeyboardHeight, useNavigation } from '@granite-js/react-native';
import { useScreenInsets } from '../ui/screenInsets';
import { generateHapticFeedback } from '@apps-in-toss/framework';
import { NOTE_PLACEHOLDER, arrivalPrompt } from '../domain/copy';
import { saveRecord } from '../data/records';
import { CONGESTION_LABEL } from '../data/tmap/congestion';
import {
  lookupDestinationCongestion,
  type DestinationCongestion,
} from '../data/destination-congestion';
import { colors, radius, spacing, type } from '../ui/theme';
import { useTrip } from '../state/TripContext';

export const Route = createRoute('/arrive', {
  component: Arrive,
});

/**
 * 이 앱의 시그니처 화면.
 *
 * 이름이 'Some Time Left'인데 정작 그 남은 시간에 뭘 하는지가 없으면 안 된다.
 * 도착해서 약속까지 남은 시간이 곧 한 줄을 적는 시간이다.
 */
function Arrive() {
  const navigation = useNavigation();
  const { trip, update, reset } = useTrip();
  const screen = useScreenInsets();
  const keyboardHeight = useKeyboardHeight();
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  /** 저장이 한 번 실패했다. 조용히 삼키면 사용자는 남은 줄 알고 떠난다. */
  const [saveFailed, setSaveFailed] = useState(false);
  // 계획을 세운 시계로 센다. 기기 시계가 틀어져 있으면 "몇 분 남았어요" 밑에
  // 0:00이 떠 있는 화면이 만들어진다.
  const offset = trip.clockOffsetMs;
  const [nowMs, setNowMs] = useState(() => Date.now() + offset);
  const [congestion, setCongestion] = useState<DestinationCongestion | null>(null);
  // 한 번만 남긴다. 버튼과 '뒤로 나가기'가 겹쳐도 기록이 둘이 되면 안 된다.
  const saved = useRef(false);

  useEffect(() => {
    generateHapticFeedback({ type: 'softMedium' }).catch(() => {});
  }, []);

  // 약속 장소가 대형 시설이면 지금 얼마나 붐비는지 한 줄 얹는다.
  // 대부분의 장소는 대상이 아니므로 없으면 조용히 생략한다.
  useEffect(() => {
    if (trip.destination == null) {
      return;
    }
    let cancelled = false;

    lookupDestinationCongestion({
      name: trip.destinationName,
      address: '',
      at: trip.destination,
      ...(trip.destinationPoiId != null ? { poiId: trip.destinationPoiId } : {}),
    }).then((result) => {
      if (!cancelled) {
        setCongestion(result);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [trip.destination, trip.destinationName, trip.destinationPoiId]);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now() + offset), 1000);
    return () => clearInterval(timer);
  }, [offset]);

  const leftSec = useMemo(() => {
    if (trip.arriveAtMs == null) return 0;
    return Math.max(0, Math.round((trip.arriveAtMs - nowMs) / 1000));
  }, [trip.arriveAtMs, nowMs]);

  const mm = Math.floor(leftSec / 60);
  const ss = String(leftSec % 60).padStart(2, '0');

  /**
   * 걸은 일을 기록에 남긴다.
   *
   * 화면을 어떻게 떠나든 **한 번만** 남긴다 — 버튼을 눌러도, 뒤로 나가도.
   * 걸은 건 일어난 일이라 버튼을 눌러야만 인정되는 게 아니고, 여기서 안 남기면
   * '지나온 길'에서 그날이 통째로 사라진다. 선택인 건 한 줄을 적는 것뿐이다.
   *
   * 중복 방지는 화면 안의 ref가 아니라 이동(Trip)에 둔다. 뒤로 나갔다 다시 들어오면
   * 화면이 새로 만들어져 ref는 초기화되지만, 걸은 일은 여전히 한 번이기 때문이다.
   */
  const persist = useCallback(async (): Promise<boolean> => {
    if (saved.current || trip.recordSaved || trip.mood == null || trip.route == null) {
      // 남길 게 없거나 이미 남았다. 어느 쪽이든 잃은 것은 없다.
      return true;
    }
    saved.current = true;

    const now = Date.now() + offset;
    try {
      await saveRecord({
        id: `${now}`,
        companion: trip.companion,
        mood: trip.mood,
        note: note.trim(),
        arrivedAt: now,
        destinationName: trip.destinationName,
        // 실제로 걸은 만큼만. 중간에 끝냈다면 나머지는 걷지 않은 길이다.
        path: trip.walkedPath ?? trip.route.candidate.path,
        routeId: trip.route.candidate.id,
        distanceM: trip.walkedDistanceM ?? trip.route.candidate.distanceM,
      });
      update({ recordSaved: true });
      return true;
    } catch {
      // 다음 기회에 다시 시도할 수 있도록 되돌린다.
      saved.current = false;
      return false;
    }
  }, [trip, note, offset, update]);

  /**
   * 화면을 떠날 때 남긴다.
   *
   * `blur`만으로는 부족하다. 뒤로 나가면 이 화면은 사라지는데, 리액트는 사라지는
   * 컴포넌트의 정리(리스너 해제)를 먼저 하고 그다음에 blur를 쏘기 때문에
   * 정작 뒤로 나가는 경우를 못 받을 수 있다. 그래서 사라질 때도 함께 남긴다.
   * 두 번 불려도 위 가드가 한 번만 남긴다.
   */
  const persistRef = useRef(persist);
  persistRef.current = persist;

  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => {
      persistRef.current();
    });
    return () => {
      unsubscribe();
      persistRef.current();
    };
  }, [navigation]);

  const finish = useCallback(async () => {
    setSaving(true);
    /*
     * 저장이 됐을 때만 이동을 지운다.
     *
     * 저장 실패 후에 reset()을 부르면 기록의 재료(mood·route)가 사라져서,
     * persist의 catch가 열어 둔 "다음 기회"가 영영 오지 않는다 — 저장소가 한 번
     * 흔들렸다고 걸은 하루가 통째로 사라지는 것이다. 화면에 사실대로 말하고
     * 이 화면에 남는다. 버튼이 다시 눌리므로 그 자리가 다음 기회다.
     */
    setSaveFailed(false);
    const ok = await persist();
    if (!ok) {
      setSaving(false);
      setSaveFailed(true);
      return;
    }
    reset();
    navigation.navigate('/');
  }, [persist, reset, navigation]);

  return (
    <View style={[styles.screen, { paddingTop: screen.top }]}>
      {/*
        한 줄을 적는 화면이라 키보드가 올라온다. 작은 기기에서는 입력칸이 통째로
        가리므로 스크롤로 두고, 키보드 높이만큼 아래를 비워 캐럿이 늘 보이게 한다.
      */}
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* 숫자 하나가 주인공이라, 무엇까지 남은 시간인지만 작게 얹는다. */}
        <Text style={styles.countdownLabel}>약속까지</Text>
        <Text style={styles.countdown}>
          {mm}:{ss}
        </Text>

        <Text style={styles.prompt}>
          {arrivalPrompt(trip.companion.trim() === '' ? null : trip.companion)}
        </Text>

        {congestion != null && (
          <Text style={styles.congestion}>
            {congestion.poiName}, 지금 {CONGESTION_LABEL[congestion.level]}
          </Text>
        )}

        <View style={styles.noteBox}>
          <TextInput
            style={styles.note}
            placeholder={NOTE_PLACEHOLDER}
            placeholderTextColor={colors.inkFaint}
            value={note}
            onChangeText={setNote}
            multiline
          />
        </View>

        {/*
          지킬 수 있는 말만 한다. 길 위에서 다시 꺼내 주는 기능은 아직 없고,
          남긴 말이 실제로 가는 곳은 '지나온 길'이다.
        */}
        <Text style={styles.hint}>적어두면 지나온 길에 그대로 남아 있어요.</Text>
      </ScrollView>

      {saveFailed && (
        <Text style={styles.saveFailed}>기록을 저장하지 못했어요. 한 번만 다시 눌러주세요.</Text>
      )}

      <Pressable
        style={({ pressed }) => [
          styles.cta,
          { marginBottom: keyboardHeight > 0 ? keyboardHeight + spacing.md : screen.bottom },
          pressed && styles.pressed,
        ]}
        onPress={finish}
        disabled={saving}
      >
        <Text style={styles.ctaText}>
          {saveFailed ? '다시 저장하기' : note.trim() === '' ? '그냥 닫기' : '남기고 닫기'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  // 실패는 조용히 말하되 보이게. 이 앱에서 붉은색을 쓰는 유일한 자리가 아니도록 잉크로.
  saveFailed: { ...type.caption, color: colors.inkSoft, textAlign: 'center', marginBottom: spacing.sm },
  content: { paddingBottom: spacing.lg },
  // 이 화면의 주인공. 색으로 강조하지 않고 크기로만 말한다 —
  // 파란 숫자는 알림처럼 읽히고, 먹색 숫자는 그냥 남은 시간으로 읽힌다.
  countdownLabel: { ...type.caption, color: colors.inkSoft, marginTop: spacing.lg },
  countdown: {
    ...type.numeral,
    fontSize: 64,
    lineHeight: 72,
    color: colors.ink,
  },
  prompt: { ...type.title, color: colors.ink, marginTop: spacing.md },
  congestion: { ...type.body, color: colors.inkSoft, marginTop: spacing.sm },
  noteBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.xl,
    minHeight: 120,
  },
  note: { ...type.body, color: colors.ink, minHeight: 96, textAlignVertical: 'top' },
  hint: { ...type.caption, color: colors.inkFaint, marginTop: spacing.sm },
  // 버튼은 먹색. 레퍼런스 세 앱 모두 크롬에 색을 쓰지 않는다 —
  // 색은 사용자가 쌓은 것에서만 나온다.
  cta: {
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
  },
  ctaText: { ...type.title, color: colors.surface },
  pressed: { opacity: 0.6 },
});

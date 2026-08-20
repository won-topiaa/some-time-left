import { useSafeAreaInsets } from '@granite-js/native/react-native-safe-area-context';
import { spacing } from './theme';

/**
 * 토스가 얹는 상단 바의 높이 (pt).
 *
 * `granite.config.ts`에서 `transparentBackground: true`로 뒀기 때문에 이 바는
 * 자리를 차지하지 않고 **화면 위에 떠 있다** — 프레임워크 구현이
 * `position: 'absolute', top: insets.top, height: 44, zIndex: 1`이다.
 * 그래서 화면이 스스로 이만큼을 비워 두지 않으면 첫 줄이 뒤로 가린다.
 */
const TOSS_NAV_BAR_H = 44;

export interface ScreenInsets {
  /** 상단 안전 영역 + 토스 상단 바까지 비켜난 여백 */
  top: number;
  /** 하단 안전 영역(홈 인디케이터)까지 비켜난 여백 */
  bottom: number;
}

/**
 * 화면 하나가 잡아야 할 위아래 여백.
 *
 * 여섯 화면이 각자 계산하면 한 곳만 고쳐도 어긋나므로 여기 한 군데서 낸다.
 * 값은 `padding` 대신 `paddingTop`/`paddingBottom`으로 얹어 쓴다.
 */
export function useScreenInsets(): ScreenInsets {
  const insets = useSafeAreaInsets();
  return {
    top: insets.top + TOSS_NAV_BAR_H + spacing.sm,
    // 홈 인디케이터 위로 버튼이 걸치면 스와이프와 싸운다.
    bottom: insets.bottom + spacing.lg,
  };
}

/**
 * 스크롤을 내리는 만큼만 펴 보이는 한 묶음.
 *
 * 첫 화면의 추신이 다섯 문단을 한꺼번에 깔았다. 읽기도 전에 밀린다는 말을 들었고
 * ("와다다 나오니깐 거부감이 들더라고"), 실제로 편지를 통째로 들이미는 모양이었다.
 * 묶음이 화면에 들어올 때 조용히 떠오르게 하면, 스크롤하는 속도가 곧 읽는 속도가 된다.
 *
 * **자리는 처음부터 차지한다.** 나타날 때 자리를 만들면 스크롤 높이가 그때마다
 * 늘어나 손가락 밑에서 내용이 밀린다 — 읽으려고 내린 사람에게 가장 나쁜 움직임이다.
 * 그래서 투명도만 오간다.
 *
 * 네이티브 드라이버로 돌린다. 자바스크립트 쪽에서 스크롤마다 상태를 바꾸면 첫 화면
 * 전체가 초당 수십 번 다시 그려지는데, Hermes에는 JIT이 없어 그 값이 그대로 든다.
 */

import { useRef, useState, type ReactNode } from 'react';
import { Animated, type LayoutChangeEvent, type ViewStyle } from 'react-native';

/**
 * 떠오르고 물러나는 네 문턱 (뷰포트 높이 대비, 묶음 윗변이 화면 어디에 있는가).
 *
 * 처음엔 떠오르기만 하고 안 사라지게 뒀는데, 그러면 몇 번 스크롤한 뒤에는 결국
 * 다섯 문단이 다 보인다 — 벽을 없애려던 것이 자리만 벌려 놓은 셈이었다. 실기기
 * 피드백대로 **지금 읽는 묶음만** 남긴다: 아래에서 올라오며 떠오르고, 위로
 * 지나가면 물러난다. 스크롤 위치에 매인 값이라 도로 내리면 그대로 되돌아온다.
 *
 *   IN_*  — 화면 바닥 쪽. 윗변이 94%에서 75%로 올라오는 동안 떠오른다.
 *   OUT_* — 화면 위쪽. 윗변이 34%에서 14%로 올라가는 동안 물러난다.
 *
 * 그 사이(34%~75%)가 읽는 자리다. 묶음 사이 간격이 이 폭보다 넓어야
 * 두 묶음이 같이 또렷해지는 순간이 없다 — 간격은 부모(index.tsx)가 잰다.
 */
const IN_START = 0.94;
const IN_END = 0.75;
const OUT_START = 0.34;
const OUT_END = 0.14;

export function RevealOnScroll({
  scrollY,
  viewportHeight,
  offsetY,
  enabled,
  style,
  children,
}: {
  /** 스크롤 위치. 부모의 ScrollView가 네이티브로 직접 밀어 넣는다. */
  scrollY: Animated.Value;
  /** 스크롤 영역의 높이. 아직 모르면 0 — 그때는 그냥 보여준다. */
  viewportHeight: number;
  /**
   * 이 묶음을 감싼 상자가 스크롤 내용에서 어디에 앉았는지.
   *
   * **`onLayout`은 부모 기준 좌표를 준다.** 스크롤 위치와 견주려면 내용 전체 기준이
   * 어디인지를 알아야 하는데, 묶음이 상자 안에 들어 있으면 자기 좌표만으로는 알 수
   * 없다 — 그대로 쓰면 값이 늘 작아서 처음부터 전부 또렷하게 나오고, 펴 보이는
   * 일이 조용히 아무 일도 안 하게 된다. 감싼 상자의 자리를 받아서 더한다.
   */
  offsetY: number;
  /** 움직임을 줄여 달라고 한 기기에서는 끈다. */
  enabled: boolean;
  style?: ViewStyle;
  children: ReactNode;
}) {
  /** 감싼 상자 안에서의 자리. 한 번 재고 나면 안 바뀐다. */
  const [top, setTop] = useState<number | null>(null);
  const onLayout = useRef((event: LayoutChangeEvent) => {
    setTop(event.nativeEvent.layout.y);
  }).current;

  /*
   * 아직 못 쟀거나 꺼져 있으면 그냥 보여준다.
   *
   * 여기서 숨겨 두면 레이아웃을 못 재는 상황(측정 이벤트가 안 오는 기기)에서
   * 추신이 영영 안 보인다. 이 컴포넌트가 하는 일은 꾸미는 것이므로,
   * 확신이 없을 때는 글이 보이는 쪽으로 넘어진다.
   */
  if (!enabled || top == null || viewportHeight <= 0) {
    return (
      <Animated.View style={style} onLayout={onLayout}>
        {children}
      </Animated.View>
    );
  }

  /*
   * 입력 구간은 **스크롤 위치**로 환산한다. 이 묶음의 윗변이 화면 바닥에 닿는
   * 순간이 `top - viewportHeight`이고, 거기서 더 내리면 위로 올라온다.
   *
   * 첫 묶음처럼 처음부터 화면 안에 있는 것은 이 값이 음수라, 스크롤 0에서 이미
   * 구간을 지나 있다 — 따로 예외를 두지 않아도 처음부터 또렷하다.
   */
  const contentTop = offsetY + top;
  const appear = contentTop - viewportHeight * IN_START;
  const shown = contentTop - viewportHeight * IN_END;
  const leaving = contentTop - viewportHeight * OUT_START;
  const gone = contentTop - viewportHeight * OUT_END;

  // 네 문턱이 순서를 지키게 한다 — 뷰포트가 아주 작으면 이웃이 겹칠 수 있다.
  const inputRange = [appear, shown, leaving, gone];
  for (let i = 1; i < inputRange.length; i += 1) {
    inputRange[i] = Math.max(inputRange[i], inputRange[i - 1] + 1);
  }

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: scrollY.interpolate({
            inputRange,
            outputRange: [0, 1, 1, 0],
            extrapolate: 'clamp',
          }),
        },
      ]}
      onLayout={onLayout}
    >
      {children}
    </Animated.View>
  );
}

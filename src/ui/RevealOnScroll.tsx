/**
 * 스크롤을 내리는 만큼만 펴 보이는 한 묶음.
 *
 * 첫 화면의 추신이 다섯 문단을 한꺼번에 깔았다. 읽기도 전에 밀린다는 말을 들었고
 * ("와다다 나오니깐 거부감이 들더라고"), 지금 읽는 묶음만 남기기로 했다.
 *
 * **창은 이웃이 정한다.** 처음엔 화면 높이의 몇 %라는 문턱 네 개로 직접 재 봤는데,
 * 그러면 첫 묶음의 "또렷한 구간"이 통째로 **음수 스크롤**에 놓인다 — 화면을 켜면
 * 첫 문단이 반투명하게 뜨고 조금만 내려도 사라졌다. 게다가 묶음 간격이 그 구간보다
 * 넓어야 한다는 조건이 붙어서, 간격을 화면 비율로 잡아야 했고 그 바람에 키보드가
 * 올라오면(스크롤 영역이 줄면) 간격이 줄어 손가락 밑의 내용이 튀었다.
 *
 * 그래서 창을 절대 좌표로 받는다. 부모가 묶음들의 실제 위치를 재서 **이웃 사이의
 * 경계**를 넘겨주면, 이 컴포넌트는 그 사이에서만 또렷하다. 첫 묶음의 시작은
 * 열려 있고(처음부터 또렷) 마지막 묶음의 끝도 열려 있다(바닥까지 남는다).
 * 간격은 이제 아무 조건도 지지 않으므로 눈에 좋은 값으로 두면 된다.
 *
 * 자리는 처음부터 차지하고 투명도만 오간다 — 나타날 때 자리를 만들면 손가락 밑에서
 * 글이 밀린다. 네이티브 드라이버로 돌려서 스크롤마다 첫 화면이 다시 그려지지 않게 한다.
 */

import { type ReactNode } from 'react';
import { Animated, type LayoutChangeEvent, type ViewStyle } from 'react-native';

/** 이 묶음이 또렷한 스크롤 구간. 부모가 이웃을 보고 정한다. */
export interface RevealWindow {
  /** 여기서부터 떠오른다. 첫 묶음은 아주 작은 값이라 처음부터 또렷하다. */
  enter: number;
  /** 여기서 다 물러난다. 마지막 묶음은 아주 큰 값이라 끝까지 남는다. */
  exit: number;
  /** 떠오르고 물러나는 데 쓰는 스크롤 거리 (px). */
  fade: number;
}

export function RevealOnScroll({
  scrollY,
  window: revealWindow,
  index,
  onMeasure,
  style,
  children,
}: {
  /** 스크롤 위치. 부모의 ScrollView가 네이티브로 직접 밀어 넣는다. */
  scrollY: Animated.Value;
  /** 또렷한 구간. 아직 못 쟀거나 움직임을 줄인 기기에서는 null — 그냥 보여준다. */
  window: RevealWindow | null;
  index: number;
  /** 잰 자리를 부모에게 알린다. 부모가 이웃과 견줘 경계를 낸다. */
  onMeasure: (index: number, y: number) => void;
  style?: ViewStyle;
  children: ReactNode;
}) {
  // 렌더마다 새 클로저가 생기지만 onLayout은 배치가 바뀔 때만 불린다 —
  // 프롭이 새로워졌다고 다시 재지는 않는다.
  const onLayout = (event: LayoutChangeEvent) => {
    onMeasure(index, event.nativeEvent.layout.y);
  };

  /*
   * 창이 없으면 그냥 보여준다.
   *
   * 여기서 숨겨 두면 레이아웃을 못 재는 상황에서 추신이 영영 안 보인다. 이
   * 컴포넌트가 하는 일은 꾸미는 것이므로, 확신이 없을 때는 글이 보이는 쪽으로 넘어진다.
   */
  if (revealWindow == null) {
    return (
      <Animated.View style={style} onLayout={onLayout}>
        {children}
      </Animated.View>
    );
  }

  const { enter, exit, fade } = revealWindow;
  // 네 지점이 순서를 지키게 한다 — 묶음이 아주 짧으면 가운데 둘이 뒤집힐 수 있다.
  const stops = [enter, enter + fade, exit - fade, exit];
  for (let i = 1; i < stops.length; i += 1) {
    stops[i] = Math.max(stops[i], stops[i - 1] + 1);
  }

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: scrollY.interpolate({
            inputRange: stops,
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

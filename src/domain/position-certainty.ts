/**
 * 지금 위치를 알고 있는가.
 *
 * **없는 것과 안 움직이는 것은 다르다.** 걷는 화면은 그 둘을 구별하지 않아서,
 * 횡단보도에 서 있기만 해도 "지금 위치가 잡히지 않아요"가 떴다.
 *
 * 위치 구독은 **변경을 알리는** 물건이다 — SDK 문서 그대로 "위치가 변경되면
 * 콜백을 실행"하고, `distanceInterval`은 "위치 변경 거리"다. 5m로 걸어 뒀으니
 * 5m를 안 움직이면 콜백이 한 번도 안 온다. 그런데 화면은 "마지막 측정 이후
 * 20초가 지났다"를 곧장 "위치를 모른다"로 읽었다.
 *
 * 거꾸로다. 이벤트가 안 왔다는 건 **5m도 안 움직였다**는 뜻이고, 그러면 마지막
 * 좌표는 5m 이내로 정확하다. 서 있는 사람에게 위치를 모른다고 말하면서, 정작
 * 그 사람에게 가장 필요한 페이스 안내를 가려 버린 셈이다.
 *
 * 그렇다고 조용함이 영원히 안전한 것은 아니다. 지하도에 들어가도 이벤트는 똑같이
 * 끊기고 그때는 좌표가 실제로 낡는다 — 둘을 가를 신호가 없으므로, 한동안은 서
 * 있는 것으로 보되 너무 오래 조용하면 모른다고 말한다.
 */

/**
 * 걷는 화면이 첫 좌표를 기다려 주는 시간 (ms).
 *
 * 이 유예가 성립하려면 첫 좌표가 **오게 되어 있어야** 한다. 구독만 걸어 두고
 * 기다리면 안 된다 — 변경을 알리는 물건이라, 출발선에서 가만히 서 있는 사람에게는
 * 첫 이벤트도 오지 않는다. 그러면 이 파일이 없애려던 "조용함 = 실패"가 이 가지로
 * 되살아난다. 그래서 걷는 화면은 구독을 걸면서 `getCurrentLocation`으로 지금
 * 위치를 **직접 묻는다**. 이 시계가 재는 건 그 물음의 답이 오기까지의 시간이다.
 */
export const FIRST_FIX_GRACE_MS = 20_000;

/**
 * 마지막 측정 이후 이만큼 조용하면 좌표가 낡았다고 본다 (ms).
 *
 * 신호 대기는 길어야 2분 남짓이고, 그동안 좌표는 여전히 정확하다. 3분을 넘게
 * 조용하면 서 있는 것보다 신호가 끊긴 쪽이 더 그럼직하다 — 그때부터는 페이스
 * 안내가 낡은 좌표로 재촉하게 되므로, 모른다고 말하는 편이 정직하다.
 */
export const POSITION_STALE_MS = 3 * 60 * 1000;

/**
 * 이만큼 조용하면 지금은 걷고 있지 않다고 본다 (ms).
 *
 * 5m를 움직여야 오고, 아무리 자주 와도 3초에 한 번이다(timeInterval은 최소 주기,
 * 즉 하한이다 — SDK 문서에 "지정한 주기보다 더 긴 간격으로 업데이트될 수 있어요"라고
 * 적혀 있다). 그러니 걷는 사람은 4초 안에 한 번은 들어온다 —
 * 20초가 조용하면 서 있는 쪽이다. 좌표는 여전히 맞지만 **속도는 맞지 않는다**:
 * 조용한 동안 표본이 늘지 않아 마지막으로 걷던 속도에 멈춰 있기 때문이다.
 * 그 값을 "이 속도면"이라고 부르면 서 있는 사람에게 걷고 있다고 말하는 셈이다.
 */
export const QUIET_MS = 20_000;

export type PositionCertainty =
  /** 좌표를 믿어도 된다. 방금 받았거나, 조용하지만 그건 안 움직였다는 뜻이다. */
  | 'known'
  /** 아직 첫 측정을 못 받았다. 시작 직후의 정상 구간. */
  | 'waiting'
  /** 오류가 났거나 너무 오래 조용하다. */
  | 'lost';

export interface PositionInput {
  /**
   * **지금 켜져 있는 구독이** 오류를 보고했는가.
   *
   * 구독마다 새로 판정한다. SDK의 `onError`는 구독을 거는 시점에만 울린다 —
   * 권한을 거부당했거나 브리지 호출이 실패한 경우다(node_modules의
   * UpdateLocationEvent.listener에서 requestPermission과 startUpdateLocation
   * postMessage의 실패 경로가 전부다. 측정 이벤트 쪽에는 오류 경로가 없다).
   * 그러니 이 값의 수명은 구독의 수명이고, 다시 구독할 때 비워야 한다 —
   * 안 비우면 끊겼다 다시 걸린 멀쩡한 구독이 지난번 거부를 이어받는다.
   */
  errored: boolean;
  /** 측정을 한 번이라도 받았는가. */
  hadFix: boolean;
  /**
   * **구독을 시작한 뒤** 흐른 시간 (ms). 걷기 시작한 뒤가 아니다.
   *
   * 위치 구독은 화면이 가려지면 끊고 다시 보이면 새로 건다. 다시 걸린 구독은
   * 첫 측정을 처음부터 다시 기다리므로, 걷기 시작한 시각으로 재면 20분째 걷던
   * 사람이 돌아오는 순간 유예 없이 'lost'가 된다 — 기다릴 자격은 구독마다 새로 난다.
   */
  sinceListeningMs: number;
  /** 마지막 측정 이후 흐른 시간 (ms). 측정이 없었으면 무시된다. */
  sinceFixMs: number;
}

export function positionCertainty({
  errored,
  hadFix,
  sinceListeningMs,
  sinceFixMs,
}: PositionInput): PositionCertainty {
  // 오류는 조용함과 다르다. 이건 시스템이 직접 못 하겠다고 말한 것이다.
  if (errored) {
    return 'lost';
  }

  if (!hadFix) {
    // 첫 측정은 원래 몇 초 걸린다. 그 구간을 실패로 부르면 걷기 시작할 때마다
    // 경고가 번쩍인다.
    return sinceListeningMs > FIRST_FIX_GRACE_MS ? 'lost' : 'waiting';
  }

  return sinceFixMs > POSITION_STALE_MS ? 'lost' : 'known';
}

/** 페이스를 말해도 되는가. 좌표를 믿을 때만 재촉한다. */
export function canAdvisePace(certainty: PositionCertainty): boolean {
  return certainty === 'known';
}

/**
 * 좌표는 믿을 만하지만 지금 걷고 있지는 않은가.
 *
 * 'known' 안에는 두 사람이 있다 — 방금 측정이 들어온 걷는 사람과, 조용해서
 * 오히려 안다고 판정된 서 있는 사람. 좌표를 쓰는 데는 둘이 같지만, **속도를
 * 쓰는 데는 다르다.** 서 있는 사람의 speedMps는 마지막으로 걷던 속도에 얼어
 * 있으므로, 그 값으로 만든 도착 시각은 "이 속도면"이 아니라 "걷기 시작하면"이다.
 */
export function isQuiet(certainty: PositionCertainty, sinceFixMs: number): boolean {
  return certainty === 'known' && sinceFixMs > QUIET_MS;
}

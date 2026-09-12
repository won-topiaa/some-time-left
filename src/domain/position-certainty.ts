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

/** 걷는 화면이 첫 측정을 기다려 주는 시간 (ms). */
export const FIRST_FIX_GRACE_MS = 20_000;

/**
 * 마지막 측정 이후 이만큼 조용하면 좌표가 낡았다고 본다 (ms).
 *
 * 신호 대기는 길어야 2분 남짓이고, 그동안 좌표는 여전히 정확하다. 3분을 넘게
 * 조용하면 서 있는 것보다 신호가 끊긴 쪽이 더 그럼직하다 — 그때부터는 페이스
 * 안내가 낡은 좌표로 재촉하게 되므로, 모른다고 말하는 편이 정직하다.
 */
export const POSITION_STALE_MS = 3 * 60 * 1000;

export type PositionCertainty =
  /** 좌표를 믿어도 된다. 방금 받았거나, 조용하지만 그건 안 움직였다는 뜻이다. */
  | 'known'
  /** 아직 첫 측정을 못 받았다. 시작 직후의 정상 구간. */
  | 'waiting'
  /** 오류가 났거나 너무 오래 조용하다. */
  | 'lost';

export interface PositionInput {
  /** 위치 구독이 오류를 보고했는가. */
  errored: boolean;
  /** 측정을 한 번이라도 받았는가. */
  hadFix: boolean;
  /** 걷기 시작한 뒤 흐른 시간 (ms). */
  sinceStartMs: number;
  /** 마지막 측정 이후 흐른 시간 (ms). 측정이 없었으면 무시된다. */
  sinceFixMs: number;
}

export function positionCertainty({
  errored,
  hadFix,
  sinceStartMs,
  sinceFixMs,
}: PositionInput): PositionCertainty {
  // 오류는 조용함과 다르다. 이건 시스템이 직접 못 하겠다고 말한 것이다.
  if (errored) {
    return 'lost';
  }

  if (!hadFix) {
    // 첫 측정은 원래 몇 초 걸린다. 그 구간을 실패로 부르면 걷기 시작할 때마다
    // 경고가 번쩍인다.
    return sinceStartMs > FIRST_FIX_GRACE_MS ? 'lost' : 'waiting';
  }

  return sinceFixMs > POSITION_STALE_MS ? 'lost' : 'known';
}

/** 페이스를 말해도 되는가. 좌표를 믿을 때만 재촉한다. */
export function canAdvisePace(certainty: PositionCertainty): boolean {
  return certainty === 'known';
}

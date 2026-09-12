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

/**
 * 이만큼 조용하면 지금은 걷고 있지 않다고 본다 (ms).
 *
 * 5m마다, 늦어도 3초마다 오는 구독이다. 걷는 사람은 4초 안에 한 번은 들어온다 —
 * 20초가 조용하면 서 있는 쪽이다. 좌표는 여전히 맞지만 **속도는 맞지 않는다**:
 * 조용한 동안 표본이 늘지 않아 마지막으로 걷던 속도에 멈춰 있기 때문이다.
 * 그 값을 "이 속도면"이라고 부르면 서 있는 사람에게 걷고 있다고 말하는 셈이다.
 */
export const QUIET_MS = 20_000;

/**
 * 오류를 믿어 주는 시간 (ms).
 *
 * 오류는 조용함과 다르다 — 시스템이 직접 못 하겠다고 말한 것이다. 그렇다고
 * 한 번의 오류로 남은 길 내내 눈을 감으면, 바로 다음에 들어온 멀쩡한 좌표까지
 * 못 쓰게 된다. **오류도 낡는다.** 계속 나는 오류라면 계속 새것이므로 눈은
 * 계속 감겨 있고, 한 번 튄 것이라면 30초 뒤에는 마지막 좌표로 돌아간다.
 * 그 좌표가 진짜로 낡았다면 아래의 POSITION_STALE_MS가 다시 잡는다.
 */
export const ERROR_FRESH_MS = 30_000;

export type PositionCertainty =
  /** 좌표를 믿어도 된다. 방금 받았거나, 조용하지만 그건 안 움직였다는 뜻이다. */
  | 'known'
  /** 아직 첫 측정을 못 받았다. 시작 직후의 정상 구간. */
  | 'waiting'
  /** 오류가 났거나 너무 오래 조용하다. */
  | 'lost';

export interface PositionInput {
  /** 마지막 오류 이후 흐른 시간 (ms). 오류가 난 적이 없으면 null. */
  sinceErrorMs: number | null;
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
  sinceErrorMs,
  hadFix,
  sinceListeningMs,
  sinceFixMs,
}: PositionInput): PositionCertainty {
  // 오류는 조용함과 다르다. 이건 시스템이 직접 못 하겠다고 말한 것이다.
  // 다만 방금 난 오류만 그렇다 — 오래된 오류는 지금을 설명하지 못한다.
  if (sinceErrorMs != null && sinceErrorMs <= ERROR_FRESH_MS) {
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

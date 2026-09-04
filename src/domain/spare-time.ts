/**
 * 약속까지 남은 시간을 **선 하나로** 그리기 위한 계산.
 *
 * 첫 화면이 시각을 받아 놓고도 "오늘 오후 1시 20분"이라고만 되돌려 줬다. 맞는
 * 말이지만 그 줄로는 이 앱이 무엇을 하는 앱인지 알 수 없다 — 추신을 읽어야만
 * 안다. 남은 시간을 눈에 보이게 그려 두면, 읽지 않은 사람도 자기 자투리 시간이
 * 얼마인지 그 자리에서 본다.
 *
 * 선은 세 도막이다. 앞에서부터
 *
 *   기다림 — 여유가 산책 상한을 넘을 때만 생긴다. 늦게 나서게 될 그만큼.
 *   걷기   — 실제로 걷게 될 시간.
 *   여백   — 약속 앞에 남겨 두는 시간. 이 앱이 지키기로 한 그 몇 분.
 *
 * 셋을 더하면 지금부터 약속까지다. 그래서 화면은 비율을 따로 계산할 필요 없이
 * 세 도막을 그대로 늘어놓으면 된다.
 */

import { COMFORTABLE_WALK_SEC } from './time';

export interface SpareSpan {
  /** 지금부터 약속까지 (초). 세 도막의 합이다. */
  totalSec: number;
  /** 나서기 전에 기다리게 되는 시간 (초). 상한에 걸리지 않으면 0. */
  waitSec: number;
  /** 실제로 걷게 될 시간 (초). */
  walkSec: number;
  /** 약속 앞에 남겨 두는 시간 (초). */
  bufferSec: number;
}

/**
 * 지금과 약속 사이를 세 도막으로 나눈다. 그릴 것이 없으면 null.
 *
 * **상한을 여기서도 본다.** 여섯 시간이 비었다고 "걸을 수 있는 355분"이라고 그리면
 * 화면이 앱보다 큰 약속을 하게 된다 — 계획은 `planWalk`에서 상한에 걸려 40분에서
 * 잘리기 때문이다. 그림이 다음 화면과 다른 말을 하면 그림을 안 그리느니만 못하다.
 *
 * 약속이 이미 지났거나 지금이면 null이다. 그때는 선이 아니라 사실을 말해야 한다.
 */
export function spareSpan(
  nowMs: number,
  arriveAtMs: number,
  earlySec: number
): SpareSpan | null {
  if (!Number.isFinite(nowMs) || !Number.isFinite(arriveAtMs) || !Number.isFinite(earlySec)) {
    return null;
  }
  const totalSec = Math.round((arriveAtMs - nowMs) / 1000);
  if (totalSec <= 0) {
    return null;
  }

  // 약속 앞 여백이 남은 시간보다 크면 여백이 전부다 — 걸을 자리가 없다.
  const bufferSec = Math.min(Math.max(0, Math.round(earlySec)), totalSec);
  const available = totalSec - bufferSec;
  const walkSec = Math.min(available, COMFORTABLE_WALK_SEC);

  return { totalSec, waitSec: available - walkSec, walkSec, bufferSec };
}

/** 걸을 자리가 있는가. 없으면 화면은 선 대신 사실을 말한다. */
export function canWalk(span: SpareSpan): boolean {
  return span.walkSec > 0;
}

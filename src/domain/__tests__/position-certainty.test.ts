import { describe, expect, it } from 'vitest';
import {
  FIRST_FIX_GRACE_MS,
  POSITION_STALE_MS,
  canAdvisePace,
  positionCertainty,
} from '../position-certainty';

const base = { errored: false, hadFix: true, sinceStartMs: 60_000, sinceFixMs: 0 };

describe('positionCertainty', () => {
  it('방금 받았으면 안다', () => {
    expect(positionCertainty(base)).toBe('known');
  });

  it('시작 직후 첫 측정을 기다리는 동안은 실패가 아니다', () => {
    expect(
      positionCertainty({ ...base, hadFix: false, sinceStartMs: 3_000 })
    ).toBe('waiting');
  });

  it('한참 기다려도 첫 측정이 없으면 모른다고 한다', () => {
    expect(
      positionCertainty({ ...base, hadFix: false, sinceStartMs: FIRST_FIX_GRACE_MS + 1 })
    ).toBe('lost');
  });

  it('오류가 보고되면 곧장 모른다 — 조용함과 다르다', () => {
    expect(positionCertainty({ ...base, errored: true })).toBe('lost');
    // 시작 직후라도, 측정을 받은 적이 있어도 마찬가지다.
    expect(
      positionCertainty({ ...base, errored: true, hadFix: false, sinceStartMs: 1_000 })
    ).toBe('lost');
  });

  /*
   * 이 파일이 있는 이유다. 위치 구독은 변경을 알리는 물건이고 distanceInterval이
   * 5m라, 5m를 안 움직이면 콜백이 한 번도 안 온다. 조용함을 곧장 '모른다'로 읽어서
   * 횡단보도에 서 있기만 해도 "지금 위치가 잡히지 않아요"가 떴다.
   */
  it('서 있어서 조용한 것은 모르는 것이 아니다', () => {
    // 예전 문턱(20초)을 훌쩍 넘겨도 좌표는 여전히 정확하다 — 5m도 안 움직였으니까.
    for (const quiet of [21_000, 45_000, 90_000, POSITION_STALE_MS - 1]) {
      expect(positionCertainty({ ...base, sinceFixMs: quiet })).toBe('known');
    }
  });

  it('너무 오래 조용하면 좌표가 낡았다고 본다', () => {
    expect(
      positionCertainty({ ...base, sinceFixMs: POSITION_STALE_MS + 1 })
    ).toBe('lost');
  });

  it('신호 대기만큼은 견딘다 — 2분을 서 있어도 안다고 한다', () => {
    expect(positionCertainty({ ...base, sinceFixMs: 2 * 60_000 })).toBe('known');
  });

  it('첫 측정 유예보다 낡음 문턱이 넉넉하다', () => {
    // 거꾸로 되어 있으면 첫 측정을 받은 사람이 못 받은 사람보다 빨리 버려진다.
    expect(POSITION_STALE_MS).toBeGreaterThan(FIRST_FIX_GRACE_MS);
  });
});

describe('canAdvisePace', () => {
  it('좌표를 믿을 때만 페이스를 말한다', () => {
    expect(canAdvisePace('known')).toBe(true);
    expect(canAdvisePace('waiting')).toBe(false);
    expect(canAdvisePace('lost')).toBe(false);
  });

  /*
   * 서 있는 사람에게 페이스 안내가 돌아오는 것이 이 수정의 핵심이다.
   * paceAdvice는 서 있는 상황을 이미 다룰 줄 알고(STANDING_SPEED_MPS), 남은 시간이
   * 줄면서 안내가 스스로 "조금 서둘러야 해요"로 올라간다 — 그게 이 앱이 할 말이다.
   */
  it('서 있어서 조용한 사람에게는 페이스를 말한다', () => {
    const standing = positionCertainty({ ...base, sinceFixMs: 60_000 });
    expect(canAdvisePace(standing)).toBe(true);
  });
});

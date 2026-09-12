import { describe, expect, it } from 'vitest';
import {
  ERROR_FRESH_MS,
  FIRST_FIX_GRACE_MS,
  POSITION_STALE_MS,
  QUIET_MS,
  canAdvisePace,
  isQuiet,
  positionCertainty,
} from '../position-certainty';

const base = {
  sinceErrorMs: null,
  hadFix: true,
  sinceListeningMs: 60_000,
  sinceFixMs: 0,
};

describe('positionCertainty', () => {
  it('방금 받았으면 안다', () => {
    expect(positionCertainty(base)).toBe('known');
  });

  it('시작 직후 첫 측정을 기다리는 동안은 실패가 아니다', () => {
    expect(
      positionCertainty({ ...base, hadFix: false, sinceListeningMs: 3_000 })
    ).toBe('waiting');
  });

  it('한참 기다려도 첫 측정이 없으면 모른다고 한다', () => {
    expect(
      positionCertainty({
        ...base,
        hadFix: false,
        sinceListeningMs: FIRST_FIX_GRACE_MS + 1,
      })
    ).toBe('lost');
  });

  it('오류가 보고되면 곧장 모른다 — 조용함과 다르다', () => {
    expect(positionCertainty({ ...base, sinceErrorMs: 0 })).toBe('lost');
    // 시작 직후라도, 측정을 받은 적이 있어도 마찬가지다.
    expect(
      positionCertainty({
        ...base,
        sinceErrorMs: 0,
        hadFix: false,
        sinceListeningMs: 1_000,
      })
    ).toBe('lost');
  });

  /*
   * 오류는 '지금 못 하겠다'는 말이지 '앞으로도 못 하겠다'는 말이 아니다.
   * 참/거짓으로 들고 있으면 한 번 튄 오류가 남은 길 내내 눈을 감긴다 — 서 있는
   * 동안에는 새 측정이 안 오므로 스스로 풀릴 기회조차 없다.
   */
  it('한 번 튄 오류는 낡는다 — 마지막 좌표가 아직 성하면 돌아간다', () => {
    expect(
      positionCertainty({ ...base, sinceErrorMs: ERROR_FRESH_MS + 1, sinceFixMs: 25_000 })
    ).toBe('known');
  });

  it('오류가 계속 나면 계속 새것이다 — 눈은 감긴 채다', () => {
    expect(
      positionCertainty({ ...base, sinceErrorMs: ERROR_FRESH_MS - 1 })
    ).toBe('lost');
  });

  it('오류가 낡아도 좌표까지 낡았으면 모르는 것이다', () => {
    expect(
      positionCertainty({
        ...base,
        sinceErrorMs: ERROR_FRESH_MS + 1,
        sinceFixMs: POSITION_STALE_MS + 1,
      })
    ).toBe('lost');
  });

  /*
   * 구독은 화면이 가려지면 끊기고 다시 보이면 새로 걸린다. 도착 화면에서 한 줄을
   * 적다 돌아온 사람은 그 사이 측정이 없는 게 당연하다 — 기다려 주는 유예를
   * 걷기 시작한 시각으로 재면, 20분째 걷던 사람은 돌아오는 첫 프레임에 유예가
   * 이미 다 지나 있어 'lost'가 된다. 유예는 구독마다 새로 난다.
   */
  it('구독이 다시 걸리면 첫 측정을 다시 기다려 준다', () => {
    expect(
      positionCertainty({ ...base, hadFix: false, sinceListeningMs: 2_000 })
    ).toBe('waiting');
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

  it('오류를 믿는 시간이 낡음 문턱보다 짧다', () => {
    // 거꾸로면 오류가 낡기 전에 좌표가 먼저 낡아, 오류가 낡는 일 자체가 없다.
    expect(ERROR_FRESH_MS).toBeLessThan(POSITION_STALE_MS);
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
   *
   * 안내가 스스로 올라가는 건 남은 시간이 줄기 때문이다 — 조용한 동안에는 표본이
   * 늘지 않아 speedMps가 마지막으로 '걷던' 속도에 얼어 있고, 그래서 paceAdvice의
   * STANDING_SPEED_MPS 가지는 여기서 걸리지 않는다. 남은 거리도 같이 얼어 있으니
   * 예측 도착은 그대로인데 약속까지 남은 시간만 줄어들어, 안내가 "그대로"에서
   * "조금만 빠르게요"로, 다시 "조금 서둘러야 해요"로 올라간다.
   */
  it('서 있어서 조용한 사람에게는 페이스를 말한다', () => {
    const standing = positionCertainty({ ...base, sinceFixMs: 60_000 });
    expect(canAdvisePace(standing)).toBe(true);
  });
});

describe('isQuiet', () => {
  /*
   * 얼어 있는 속도를 "이 속도면"이라고 부르면 서 있는 사람에게 걷고 있다고
   * 말하는 셈이다. 같은 숫자라도 "걷기 시작하면"이라고 하면 참이 된다.
   */
  it('한동안 조용하면 지금 걷고 있는 게 아니다', () => {
    expect(isQuiet('known', QUIET_MS + 1)).toBe(true);
  });

  it('방금 측정이 들어왔으면 걷는 중이다', () => {
    expect(isQuiet('known', 0)).toBe(false);
    expect(isQuiet('known', QUIET_MS - 1)).toBe(false);
  });

  it('좌표를 모르면 서 있는지도 모른다', () => {
    expect(isQuiet('lost', QUIET_MS + 1)).toBe(false);
    expect(isQuiet('waiting', QUIET_MS + 1)).toBe(false);
  });

  it('조용함을 서 있다고 보는 시간이 낡음 문턱보다 짧다', () => {
    // 거꾸로면 '서 있다'가 되기 전에 좌표가 먼저 버려져, 이 구분이 무의미해진다.
    expect(QUIET_MS).toBeLessThan(POSITION_STALE_MS);
  });
});

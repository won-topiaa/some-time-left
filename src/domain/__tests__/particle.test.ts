import { describe, expect, it } from 'vitest';
import { hasFinalConsonant, objectParticle } from '../particle';

describe('hasFinalConsonant', () => {
  it('받침이 있으면 참', () => {
    for (const word of ['지훈', '민석', '동생', '팀장님', '한강', '선생님']) {
      expect(hasFinalConsonant(word)).toBe(true);
    }
  });

  it('받침이 없으면 거짓', () => {
    for (const word of ['은지', '유나', '누나', '아빠', '보라', '지수', '엄마']) {
      expect(hasFinalConsonant(word)).toBe(false);
    }
  });

  it('한글로 끝나지 않으면 판단하지 않는다', () => {
    // 소리가 읽는 사람마다 달라 규칙이 아니라 짐작이 된다.
    for (const word of ['Amy', '카페404', 'J', '???', '☕']) {
      expect(hasFinalConsonant(word)).toBeNull();
    }
  });

  it('비어 있으면 판단하지 않는다', () => {
    expect(hasFinalConsonant('')).toBeNull();
    expect(hasFinalConsonant('   ')).toBeNull();
  });

  it('앞뒤 공백은 무시하고 마지막 글자를 본다', () => {
    expect(hasFinalConsonant('  지훈  ')).toBe(true);
    expect(hasFinalConsonant('  은지  ')).toBe(false);
  });

  it('음절 영역의 양 끝에서도 맞는다', () => {
    // '가'는 받침이 없고 '힣'은 있다 — 영역의 첫 글자와 끝 글자다.
    expect(hasFinalConsonant('가')).toBe(false);
    expect(hasFinalConsonant('힣')).toBe(true);
    // '각'은 '가' 바로 다음 글자로, 종성이 하나 붙은 자리다.
    expect(hasFinalConsonant('각')).toBe(true);
  });
});

describe('objectParticle — 문장이 어색해지지 않게', () => {
  it('받침이 있으면 을, 없으면 를', () => {
    expect(`지훈${objectParticle('지훈')} 만나요`).toBe('지훈을 만나요');
    expect(`은지${objectParticle('은지')} 만나요`).toBe('은지를 만나요');
    expect(`팀장님${objectParticle('팀장님')} 만나요`).toBe('팀장님을 만나요');
    expect(`누나${objectParticle('누나')} 만나요`).toBe('누나를 만나요');
  });

  it('한글이 아니면 를로 둔다 — 둘 중 하나는 골라야 한다', () => {
    expect(objectParticle('Amy')).toBe('를');
    expect(objectParticle('')).toBe('를');
  });
});

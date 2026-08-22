import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { colors, type } from '../ui/theme';
import { MOOD_TINT, moodTint } from '../ui/moodTint';
import { MOODS } from '../domain/mood';

/**
 * 어두운 화면은 밝은 화면을 뒤집은 게 아니라 **짝**이다.
 * 한쪽에만 색이 생기거나 빠지면 그 자리가 화면에서 통째로 사라진다 —
 * 배경색이 undefined면 투명이 되고, 글자색이 undefined면 검정이 된다.
 */
describe('두 팔레트는 같은 이름을 갖는다', () => {
  it('색 이름이 정확히 같다', () => {
    // 어두운 팔레트는 리액트 네이티브를 부르는 파일에 있어서 노드에서 못 부른다.
    // 값이 아니라 이름만 볼 것이므로 원문을 읽어 확인한다.
    const source = readFileSync(path.join(__dirname, '..', 'ui', 'useTheme.ts'), 'utf8');
    const dark = source.slice(source.indexOf('const DARK: Palette = {'));
    for (const name of Object.keys(colors)) {
      expect(dark, `어두운 팔레트에 ${name}이 없다`).toContain(`${name}:`);
    }
  });
});

describe('기분 색', () => {
  it('여섯 기분 모두 밝은 쪽과 어두운 쪽이 있다', () => {
    for (const mood of MOODS) {
      expect(moodTint(mood.id, 'light')).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(moodTint(mood.id, 'dark')).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('밝은 쪽이 기본이다', () => {
    for (const mood of MOODS) {
      expect(moodTint(mood.id)).toBe(MOOD_TINT[mood.id]);
    }
  });

  /*
   * 어두운 바탕에서는 같은 색이 가라앉아 서로 구분이 안 된다.
   * 색상은 그대로 두고 밝기만 올리기로 했으므로, 실제로 더 밝아야 한다.
   */
  it('어두운 쪽이 더 밝다', () => {
    const lightness = (hex: string) =>
      [1, 3, 5].reduce((sum, i) => sum + parseInt(hex.slice(i, i + 2), 16), 0);

    for (const mood of MOODS) {
      expect(lightness(moodTint(mood.id, 'dark'))).toBeGreaterThan(
        lightness(moodTint(mood.id, 'light'))
      );
    }
  });
});

describe('글자 단계', () => {
  it('모든 단계가 줄 높이를 글자보다 크게 잡는다', () => {
    for (const [name, token] of Object.entries(type)) {
      expect(token.lineHeight, name).toBeGreaterThan(token.fontSize);
    }
  });
});

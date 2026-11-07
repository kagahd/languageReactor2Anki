import { describe, expect, it } from 'vitest';
import { toneColorize, toneOf } from './pinyin';

const id = (s: string): string => s;

describe('toneOf', () => {
  it('detects tones 1-4 from diacritics', () => {
    expect(toneOf('xīn')).toBe(1);
    expect(toneOf('lái')).toBe(2);
    expect(toneOf('shǒu')).toBe(3);
    expect(toneOf('shì')).toBe(4);
  });
  it('returns 5 for neutral (unmarked) syllables', () => {
    expect(toneOf('zi')).toBe(5);
    expect(toneOf('ma')).toBe(5);
  });
});

describe('toneColorize', () => {
  it('wraps each syllable in a tone span and preserves spacing', () => {
    expect(toneColorize('xīn shǒu', id)).toBe(
      '<span class="tone1">xīn</span> <span class="tone3">shǒu</span>',
    );
  });
  it('returns empty string for empty input', () => {
    expect(toneColorize('', id)).toBe('');
  });
});

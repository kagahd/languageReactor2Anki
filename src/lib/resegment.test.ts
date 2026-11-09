import { describe, expect, it } from 'vitest';
import { resegmentPinyin, syllabify } from './resegment';

describe('syllabify', () => {
  it('splits a glued two-syllable token', () => {
    expect(syllabify('depín')).toEqual(['de', 'pín']);
  });
  it('leaves a single valid syllable untouched', () => {
    expect(syllabify('wǒ')).toEqual(['wǒ']);
    expect(syllabify('pín')).toEqual(['pín']);
    expect(syllabify('zhuang')).toEqual(['zhuang']);
  });
  it('leaves non-pinyin tokens untouched', () => {
    expect(syllabify('Kanal!')).toEqual(['Kanal!']);
  });
  it('refuses to split an ambiguous token (keeps it whole)', () => {
    // "fangan" = "fang-an" OR "fan-gan": ambiguous -> never split.
    expect(syllabify('fangan')).toEqual(['fangan']);
  });
  it('never splits a token with uppercase (e.g. a translation word)', () => {
    expect(syllabify('Willkommen')).toEqual(['Willkommen']);
  });
});

describe('resegmentPinyin', () => {
  it('re-splits glued syllables when the result matches the Hanzi count', () => {
    // 欢迎来到我的频道 = 8 Hanzi; LR glued 的频 -> "depín".
    expect(resegmentPinyin('huān yíng lái dào wǒ depín dào', 8)).toBe(
      'huān yíng lái dào wǒ de pín dào',
    );
  });
  it('is a no-op when the pinyin already has one syllable per Hanzi', () => {
    expect(resegmentPinyin('wǒ de pín dào', 4)).toBe('wǒ de pín dào');
  });
  it('returns null (keep original) when the count does not match', () => {
    expect(resegmentPinyin('huān yíng lái dào wǒ depín dào', 9)).toBeNull();
  });
  it('returns null for empty input', () => {
    expect(resegmentPinyin('', 3)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { isPinyin, resegmentPinyin, syllabify } from './resegment';

describe('isPinyin', () => {
  it('accepts valid pinyin (incl. glued and trailing punctuation)', () => {
    expect(isPinyin('wǒ')).toBe(true);
    expect(isPinyin('depín')).toBe(true);
    expect(isPinyin('zìjǐ.')).toBe(true);
  });
  it('rejects translation words (lowercase or capitalized)', () => {
    expect(isPinyin('welcome')).toBe(false);
    expect(isPinyin('Willkommen')).toBe(false);
  });
});

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
  it('keeps valid -ue syllables whole (xué/jué/què/yuè)', () => {
    // Regression: without "ue" in the finals, "xué" wrongly split into "xu é".
    expect(syllabify('xué')).toEqual(['xué']);
    expect(syllabify('yuè')).toEqual(['yuè']);
    expect(syllabify('què')).toEqual(['què']);
  });
  it('splits a token that ends in punctuation and reattaches it', () => {
    expect(syllabify('zìjǐ.')).toEqual(['zì', 'jǐ.']);
  });
  it('terminates quickly on a long unsegmentable token', () => {
    const token = 'an'.repeat(12) + 'x';
    expect(syllabify(token)).toEqual([token]);
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
  it('splits a glued token at a sentence boundary with trailing punctuation', () => {
    // 做自己。 -> "zuò zìjǐ." where 自己 is glued; punctuation stays on the last syllable.
    expect(resegmentPinyin('zuò zìjǐ.', 3)).toBe('zuò zì jǐ.');
  });
  it('does not mis-split when a valid -ue syllable meets an ambiguous token', () => {
    // 学西安话: "xué xīān huà" - 西安 stays ambiguous, so the count never matches
    // and the original is kept (no bogus "xu é ...").
    expect(resegmentPinyin('xué xīān huà', 4)).toBeNull();
  });
});

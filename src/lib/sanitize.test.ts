import { describe, expect, it } from 'vitest';
import {
  cjkCount,
  cleanTranslation,
  keepHanzi,
  keepPinyin,
  looksLikePinyin,
  splitPinyinTranslation,
  stripInvisible,
} from './sanitize';

// Zero-width space LR mixes between syllables (it does not match \s).
const ZWSP = String.fromCharCode(0x200b); // U+200B ZERO WIDTH SPACE
// BOM / zero-width no-break space - this one DOES match \s in JavaScript.
const BOM = String.fromCharCode(0xfeff); // U+FEFF

describe('keepHanzi', () => {
  it('removes latin/pinyin, keeps only Hanzi', () => {
    expect(keepHanzi('wǒ shì xīn shǒu 我是新手')).toBe('我是新手');
  });
  it('handles LR contamination (pinyin glued before hanzi)', () => {
    expect(keepHanzi('wǒzàixuéxíxībānyáyǔhérìyǔ我在学习西班牙语和日语')).toBe(
      '我在学习西班牙语和日语',
    );
  });
  it('keeps Chinese punctuation', () => {
    expect(keepHanzi('他仍是个商业新手。')).toBe('他仍是个商业新手。');
  });
});

describe('keepPinyin', () => {
  it('removes Hanzi, collapses spaces', () => {
    expect(keepPinyin('wǒ shì xīn shǒu 我是新手')).toBe('wǒ shì xīn shǒu');
  });
});

describe('cjkCount', () => {
  it('counts ideographs only (not punctuation)', () => {
    expect(cjkCount('我是新手')).toBe(4);
    expect(cjkCount('他仍是个商业新手。')).toBe(8);
    expect(cjkCount('wǒ shì')).toBe(0);
  });
});

describe('looksLikePinyin', () => {
  it('accepts lowercase pinyin syllables (toned and neutral)', () => {
    expect(looksLikePinyin('xīn')).toBe(true);
    expect(looksLikePinyin('shǒu')).toBe(true);
    expect(looksLikePinyin('zi')).toBe(true);
  });
  it('rejects capitalized translation words and CJK', () => {
    expect(looksLikePinyin('Ich')).toBe(false);
    expect(looksLikePinyin('Es')).toBe(false);
    expect(looksLikePinyin('新手')).toBe(false);
  });
  it('rejects punctuation-only tokens', () => {
    expect(looksLikePinyin('，')).toBe(false);
    expect(looksLikePinyin('.')).toBe(false);
  });
});

describe('splitPinyinTranslation', () => {
  it('splits full pinyin prefix from the translation', () => {
    const r = splitPinyinTranslation(
      'běn zi shàng yǒu yì xiē wèn tí Es gibt einige Probleme mit dem Notebook.',
      8,
    );
    expect(r.pinyin).toBe('běn zi shàng yǒu yì xiē wèn tí');
    expect(r.translation).toBe('Es gibt einige Probleme mit dem Notebook.');
  });
  it('handles a short sentence', () => {
    const r = splitPinyinTranslation('wǒ shì xīn shǒu Ich bin ein Neuling.', 4);
    expect(r.pinyin).toBe('wǒ shì xīn shǒu');
    expect(r.translation).toBe('Ich bin ein Neuling.');
  });
  it('yields empty pinyin when the line has no pinyin prefix', () => {
    const r = splitPinyinTranslation('Ich bin ein Neuling.', 4);
    expect(r.pinyin).toBe('');
    expect(r.translation).toBe('Ich bin ein Neuling.');
  });
  it('falls back to word count when hanziCount is 0', () => {
    const r = splitPinyinTranslation('wǒ shì Something', 0);
    expect(r.pinyin).toBe('wǒ shì');
    expect(r.translation).toBe('Something');
  });
  it('splits correctly when LR glues zero-width spaces onto a syllable', () => {
    // Regression: U+200B before "zi" used to make the 9th syllable fail the
    // pinyin check, cutting the split short and spilling pinyin into German.
    const line = `hái zi yǒu le zì jǐ de hái ${ZWSP}${ZWSP}${ZWSP}${ZWSP}zi de shí hòu Wenn das Kind selbst ein Kind hat`;
    const r = splitPinyinTranslation(line, 12);
    expect(r.pinyin).toBe('hái zi yǒu le zì jǐ de hái zi de shí hòu');
    expect(r.translation).toBe('Wenn das Kind selbst ein Kind hat');
  });
  it('treats U+FEFF as a separator, not a character to delete', () => {
    // Regression: U+FEFF matches \s in JS, so it must stay and be normalized to a
    // space (keeping tokens apart) rather than be stripped (which would merge them).
    const r = splitPinyinTranslation(`wǒ shì${BOM}Ich bin ein Neuling.`, 2);
    expect(r.pinyin).toBe('wǒ shì');
    expect(r.translation).toBe('Ich bin ein Neuling.');
  });
});

describe('stripInvisible', () => {
  it('removes zero-width characters but keeps normal text', () => {
    expect(stripInvisible(`hái${ZWSP}${ZWSP}zi`)).toBe('háizi');
    expect(stripInvisible('hái zi')).toBe('hái zi');
  });
  it('does NOT remove U+FEFF (it is whitespace, handled by \\s normalization)', () => {
    expect(stripInvisible(`shì${BOM}Ich`)).toBe(`shì${BOM}Ich`);
  });
});

describe('cleanTranslation', () => {
  it('strips leading Hanzi and the sentence pinyin prefix', () => {
    const out = cleanTranslation('我是新手 wǒ shì xīn shǒu Ich bin ein Neuling.', 'wǒ shì xīn shǒu');
    expect(out).toBe('Ich bin ein Neuling.');
  });
  it('leaves a clean translation untouched', () => {
    expect(cleanTranslation('Ich bin ein Neuling.', '')).toBe('Ich bin ein Neuling.');
  });
});

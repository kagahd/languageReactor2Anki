import { describe, expect, it } from 'vitest';
import {
  cjkCount,
  cleanTranslation,
  keepHanzi,
  keepPinyin,
  looksLikePinyin,
  splitPinyinTranslation,
  stripBlankPlaceholders,
  stripInvisible,
  trimEdgePunct,
} from './sanitize';

// CJK/"smart" double quotes LR wraps around a word's pinyin gloss.
const LQ = String.fromCharCode(0x201c); // “
const RQ = String.fromCharCode(0x201d); // ”

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
  it('keeps token counting (not syllables) when hanziCount is 0, even with a glued token', () => {
    const r = splitPinyinTranslation('wǒ depín dào', 0);
    expect(r.pinyin).toBe('wǒ depín dào');
    expect(r.translation).toBe('');
  });
  it('peels CJK quotes that wrap a pinyin gloss (quotes glued to tokens)', () => {
    // LR: “shàng gè yuè” "letzten Monat"  (上个月, 3 Hanzi)
    const r = splitPinyinTranslation(`${LQ}shàng gè yuè${RQ} "letzten Monat"`, 3);
    expect(r.pinyin).toBe('shàng gè yuè');
    expect(r.translation).toBe('"letzten Monat"');
  });
  it('skips standalone quote tokens in the pinyin region', () => {
    // LR: “ qù nián ” huò zhě "Letztes Jahr" oder  (去年或者, 4 Hanzi)
    const r = splitPinyinTranslation(`${LQ} qù nián ${RQ} huò zhě "Letztes Jahr" oder`, 4);
    expect(r.pinyin).toBe('qù nián huò zhě');
    expect(r.translation).toBe('"Letztes Jahr" oder');
  });
  it('never strips quotes from the translation (any language)', () => {
    // fancy quotes AFTER the pinyin belong to the translation and must stay
    const r = splitPinyinTranslation(`wǒ shì ${LQ} hello ${RQ} world`, 2);
    expect(r.pinyin).toBe('wǒ shì');
    expect(r.translation).toBe(`${LQ} hello ${RQ} world`);
  });
  it('keeps a translation quote even if the next word is pinyin-segmentable', () => {
    // after the Hanzi count (2) is reached, a quote belongs to the translation;
    // "die" happens to segment as di+e but must NOT be eaten as pinyin.
    const r = splitPinyinTranslation(`wǒ shì ${LQ} die Katze`, 2);
    expect(r.pinyin).toBe('wǒ shì');
    expect(r.translation).toBe(`${LQ} die Katze`);
  });
  it('consumes a matching closing gloss quote even at the syllable budget', () => {
    // 去年 (2 Hanzi): the closing ” must not leak into the translation.
    const r = splitPinyinTranslation(`${LQ} qù nián ${RQ} "Letztes Jahr"`, 2);
    expect(r.pinyin).toBe('qù nián');
    expect(r.translation).toBe('"Letztes Jahr"');
  });
  it('treats an opening quote with no matching close as the translation (erhua)', () => {
    // 一点儿 (3 Hanzi): diǎnr is erhua (1 token); the stray “ has no closing ” and
    // must stay in the translation, not open a gloss that eats German "die".
    const r = splitPinyinTranslation(`yì diǎnr ${LQ} die Katze`, 3);
    expect(r.pinyin).toBe('yì diǎnr');
    expect(r.translation).toBe(`${LQ} die Katze`);
  });
  it('does not pull a translation word in to fill a reduced (blank-adjusted) budget', () => {
    // simulates 4 Hanzi with one LR-blanked syllable: budget = 3, so "ma" stays.
    const r = splitPinyinTranslation('wǒ xǐ de ma maison.', 3);
    expect(r.pinyin).toBe('wǒ xǐ de');
    expect(r.translation).toBe('ma maison.');
  });
  it('keeps a quoted TRANSLATION span (not pinyin) intact, incl. the opening quote', () => {
    // 一点儿 (3 Hanzi, erhua): the quoted span "A little" is not pinyin, so it is
    // a quoted translation - the opening “ must not be discarded.
    const r = splitPinyinTranslation(`yì diǎnr ${LQ} A little ${RQ}`, 3);
    expect(r.pinyin).toBe('yì diǎnr');
    expect(r.translation).toBe(`${LQ} A little ${RQ}`);
  });
  it('does not eat a pinyin-segmentable word from a glued quoted translation', () => {
    // "a" segments as pinyin, but the span "a little" is not all-pinyin -> keep it.
    const r = splitPinyinTranslation(`yì diǎnr ${LQ}a little${RQ}`, 3);
    expect(r.pinyin).toBe('yì diǎnr');
    expect(r.translation).toBe(`${LQ}a little${RQ}`);
  });
  it('stops at the Hanzi syllable count with a glued token + lowercase translation', () => {
    // 8 Hanzi, "depín" is one token = two syllables, translation starts lowercase.
    const r = splitPinyinTranslation('huān yíng lái dào wǒ depín dào welcome to my channel.', 8);
    expect(r.pinyin).toBe('huān yíng lái dào wǒ depín dào');
    expect(r.translation).toBe('welcome to my channel.');
  });
  it('does not let a lowercase non-pinyin word compensate an ambiguous glued token', () => {
    // "fangan" is ambiguous (counts as 1 syllable); "welcome" must not slip into
    // the pinyin to make the count reach 4 - it is not segmentable pinyin.
    const r = splitPinyinTranslation('wǒ fangan dào welcome', 4);
    expect(r.pinyin).toBe('wǒ fangan dào');
    expect(r.translation).toBe('welcome');
  });
  it('keeps an erhua token in the pinyin (not truncated into the translation)', () => {
    const r = splitPinyinTranslation('yì diǎnr A little.', 3);
    expect(r.pinyin).toBe('yì diǎnr');
    expect(r.translation).toBe('A little.');
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

describe('stripBlankPlaceholders', () => {
  it('removes a blanked-word placeholder but keeps real bracketed content', () => {
    expect(stripBlankPlaceholders('wǒ xǐ [ __ ] de').replace(/\s+/g, ' ').trim()).toBe('wǒ xǐ de');
    expect(stripBlankPlaceholders('[note] stays')).toBe('[note] stays');
  });
});

describe('trimEdgePunct', () => {
  it('strips leading punctuation and a dangling trailing separator', () => {
    expect(trimEdgePunct('，，两天前，我见了一个好朋友，')).toBe('两天前，我见了一个好朋友');
  });
  it('keeps inner punctuation and a trailing sentence terminator', () => {
    expect(trimEdgePunct('我爱你。')).toBe('我爱你。');
    expect(trimEdgePunct('，你好？')).toBe('你好？');
  });
  it('strips a trailing comma from pinyin but keeps inner commas', () => {
    expect(trimEdgePunct('liǎng tiān qián, wǒ jiàn le yǒu,')).toBe('liǎng tiān qián, wǒ jiàn le yǒu');
  });
  it('leaves clean text untouched', () => {
    expect(trimEdgePunct('两天前我见了一个好朋友')).toBe('两天前我见了一个好朋友');
  });
  it('strips a leading sentence-final period that leaked to the translation start', () => {
    expect(trimEdgePunct('. Mir ist das peinlich.')).toBe('Mir ist das peinlich.');
    expect(trimEdgePunct('。 Ich habe mich verändert.')).toBe('Ich habe mich verändert.');
  });
  it('keeps opening/closing quotes and brackets (only separators are trimmed)', () => {
    expect(trimEdgePunct('「你好」')).toBe('「你好」');
    expect(trimEdgePunct('《红楼梦》')).toBe('《红楼梦》');
    // leading comma + trailing comma removed, the brackets around the sentence stay
    expect(trimEdgePunct('，「你好」，')).toBe('「你好」');
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

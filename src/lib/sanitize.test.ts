import { describe, expect, it } from 'vitest';
import {
  cjkCount,
  cleanTranslation,
  isGlossLine,
  isNumericToken,
  keepHanzi,
  keepPinyin,
  looksLikePinyin,
  splitGloss,
  splitPinyinTranslation,
  stripBlankPlaceholders,
  stripInvisible,
  trimEdgePunct,
} from './sanitize';

// CJK/"smart" double quotes LR wraps around a word's pinyin gloss.
const LQ = String.fromCharCode(0x201c); // “ (English/CJK opener; also the German closer)
const RQ = String.fromCharCode(0x201d); // ”
const GLQ = String.fromCharCode(0x201e); // „ (German opening low quote)

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
  it('keeps ASCII digits in the sentence (e.g. 30分钟) while dropping pinyin', () => {
    // Pinyin contamination is stripped, but the Arabic number stays with the Hanzi.
    expect(keepHanzi('sān shí fēn zhōng 30分钟之内')).toBe('30分钟之内');
  });
  it('keeps a decimal separator between digits (does not change the value)', () => {
    expect(keepHanzi('3.5分钟之内')).toBe('3.5分钟之内');
    expect(keepHanzi('3,5公里')).toBe('3,5公里');
    // a separator not between two digits is dropped
    expect(keepHanzi('30.分钟')).toBe('30分钟');
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

describe('isNumericToken', () => {
  it('recognizes digit tokens (with optional separators)', () => {
    expect(isNumericToken('3')).toBe(true);
    expect(isNumericToken('30')).toBe(true);
    expect(isNumericToken('3,')).toBe(true);
    expect(isNumericToken('3.5')).toBe(true);
  });
  it('rejects non-numeric tokens', () => {
    expect(isNumericToken('shī')).toBe(false);
    expect(isNumericToken('3rd')).toBe(false);
    expect(isNumericToken(',')).toBe(false);
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
  it('does not pull a translation word in to fill a reduced (blank-adjusted) budget', () => {
    // 4 Hanzi with one LR-blanked syllable -> caller passes budget 3, so "ma" stays.
    const r = splitPinyinTranslation('wǒ xǐ de ma maison.', 3);
    expect(r.pinyin).toBe('wǒ xǐ de');
    expect(r.translation).toBe('ma maison.');
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
  it('consumes a leading reading number (digits) into the pinyin, not the translation', () => {
    // 师傅 card: LR writes "30" as "3 0" at the start of the reading; the Hanzi
    // 30分钟之内安装空调的师傅就来了 = 14 ideographs + 2 digits. readingDigits=2.
    const r = splitPinyinTranslation(
      '3 0 fēn zhōng zhī nèi, ān zhuāng kōng tiáo de shī fu jiù lái le. Der Klimaanlagenmonteur traf innerhalb von 30 Minuten ein.',
      14,
      2,
    );
    expect(r.pinyin).toBe('3 0 fēn zhōng zhī nèi, ān zhuāng kōng tiáo de shī fu jiù lái le.');
    expect(r.translation).toBe('Der Klimaanlagenmonteur traf innerhalb von 30 Minuten ein.');
  });
  it('does not label a leading number as pinyin when no pinyin follows', () => {
    const r = splitPinyinTranslation('30 minutes later.', 0, 2);
    expect(r.pinyin).toBe('');
    expect(r.translation).toBe('30 minutes later.');
  });
  it('keeps a sentence-final reading number in the pinyin (Hanzi has those digits)', () => {
    // 编号是30。 = 3 ideographs + 2 digits; the "30" is part of the reading.
    const r = splitPinyinTranslation('biān hào shì 30. Die Nummer ist 30.', 3, 2);
    expect(r.pinyin).toBe('biān hào shì 30.');
    expect(r.translation).toBe('Die Nummer ist 30.');
  });
  it('leaves a translation number in the translation when the reading has no digits', () => {
    // 三十分钟 is written with Hanzi (no Arabic digits), so readingDigits=0: the
    // "30" after the reading belongs to the translation, not the pinyin.
    const r = splitPinyinTranslation('sān shí fēn zhōng. 30 minutes.', 4, 0);
    expect(r.pinyin).toBe('sān shí fēn zhōng.');
    expect(r.translation).toBe('30 minutes.');
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

describe('isGlossLine', () => {
  it('detects a line that opens with a CJK/"smart" quote as a word-gloss', () => {
    expect(isGlossLine(`${LQ}shàng gè yuè${RQ} "letzten Monat"`)).toBe(true);
    expect(isGlossLine(`${LQ} qù nián ${RQ} huò zhě`)).toBe(true);
  });
  it('detects a single-token gloss even with trailing punctuation', () => {
    expect(isGlossLine(`${LQ}hǎo${RQ}, "gut"`)).toBe(true);
  });
  it('detects a German-quoted gloss (opening „, closing “) with a number inside', () => {
    expect(isGlossLine(`${GLQ}wǒ 6 suì de shí hòu${LQ} Als ich 6 Jahre alt war`)).toBe(true);
  });
  it('is false for a normal line, even if its translation contains quotes', () => {
    expect(isGlossLine('wǒ shì xīn shǒu Ich bin neu')).toBe(false);
    expect(isGlossLine(`tā shuō ${LQ}hallo${RQ}`)).toBe(false); // quote not at the start
  });
  it('is false for a quote-wrapped translation (a token inside is not pinyin)', () => {
    expect(isGlossLine(`${LQ}Ich bin ein Neuling.${RQ}`)).toBe(false);
    expect(isGlossLine(`${LQ}welcome${RQ}`)).toBe(false);
    // lowercase start whose first word only LOOKS like pinyin ("die"), but the
    // span as a whole is a German translation -> must not be taken as a gloss.
    expect(isGlossLine(`${LQ}die Katze${RQ}`)).toBe(false);
  });
  it('is false for an unclosed opening quote', () => {
    expect(isGlossLine(`${LQ}yì zhōu qián Vor einer Woche`)).toBe(false);
  });
});

describe('splitGloss', () => {
  it('extracts the inner pinyin and the trailing translation', () => {
    // 一周前: “yì zhōu qián” Vor einer Woche (3 Hanzi)
    expect(splitGloss(`${LQ}yì zhōu qián${RQ} Vor einer Woche`, 3)).toEqual({
      pinyin: 'yì zhōu qián',
      translation: 'Vor einer Woche',
    });
    // 上个月: “shàng gè yuè” "letzten Monat" (3 Hanzi)
    expect(splitGloss(`${LQ}shàng gè yuè${RQ} "letzten Monat"`, 3)).toEqual({
      pinyin: 'shàng gè yuè',
      translation: '"letzten Monat"',
    });
  });
  it('recovers full pinyin when LR glues a second word onto the gloss', () => {
    // 去年或者: “ qù nián ” huò zhě "Letztes Jahr" oder (4 Hanzi). Stripping the
    // quote markers lets the syllable-count split keep all four pinyin syllables
    // and leave a clean translation, instead of cutting pinyin at the quote.
    expect(splitGloss(`${LQ} qù nián ${RQ} huò zhě "Letztes Jahr" oder`, 4)).toEqual({
      pinyin: 'qù nián huò zhě',
      translation: '"Letztes Jahr" oder',
    });
  });
  it('keeps straight quotes in the translation (only gloss markers are removed)', () => {
    expect(splitGloss(`${LQ}hǎo${RQ} "gut"`, 1)).toEqual({
      pinyin: 'hǎo',
      translation: '"gut"',
    });
  });
  it('keeps SMART quotes in the translation (only the gloss delimiters are removed)', () => {
    // Only the first opening + first closing smart quote (the gloss's own
    // delimiters) are stripped; smart quotes around a translation word stay.
    expect(splitGloss(`${LQ}hǎo${RQ} Er sagte ${LQ}gut${RQ}.`, 1)).toEqual({
      pinyin: 'hǎo',
      translation: `Er sagte ${LQ}gut${RQ}.`,
    });
  });
  it('splits a German-quoted gloss („…“) and keeps the reading number', () => {
    // 我6岁的时候 = 5 ideographs + 1 digit (readingDigits=1).
    expect(splitGloss(`${GLQ}wǒ 6 suì de shí hòu${LQ} Als ich 6 Jahre alt war`, 5, 1)).toEqual({
      pinyin: 'wǒ 6 suì de shí hòu',
      translation: 'Als ich 6 Jahre alt war',
    });
  });
  it('does not pull a translation word into a blank-adjusted gloss budget', () => {
    // 4 Hanzi, one blanked syllable -> budget 3, so French "ma" stays in translation.
    expect(splitGloss(`${LQ}wǒ xǐ de${RQ} ma maison.`, 3)).toEqual({
      pinyin: 'wǒ xǐ de',
      translation: 'ma maison.',
    });
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
  it('strips only a DUPLICATED leading-number artifact, keeping meaningful numbers', () => {
    // 师傅 card: LR prepended a stray "30，。" and then repeated "30" as the real start.
    expect(trimEdgePunct('30，。30分钟之内，安装空调的师傅就来了。')).toBe(
      '30分钟之内，安装空调的师傅就来了。',
    );
    // A leading number NOT duplicated right after the punctuation is kept:
    expect(trimEdgePunct('1、准备好。')).toBe('1、准备好。'); // list marker
    expect(trimEdgePunct('30，没错。')).toBe('30，没错。'); // response
    // A real leading number directly before a Hanzi is kept.
    expect(trimEdgePunct('30分钟之内')).toBe('30分钟之内');
    // A translation starting with a number (digit + space/ASCII) is untouched.
    expect(trimEdgePunct('30 Minuten später.')).toBe('30 Minuten später.');
    expect(trimEdgePunct('3. Platz gewonnen.')).toBe('3. Platz gewonnen.');
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

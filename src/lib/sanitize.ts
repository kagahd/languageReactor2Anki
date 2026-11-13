// Reine Bereinigungs-Funktionen, die saubere Felder erzwingen, obwohl LR Pinyin
// in die Hanzi-/Uebersetzungszeile mischt. Bewusst DOM-frei und ohne Seiteneffekte,
// damit sie als Unit-Tests pruefbar sind (siehe sanitize.test.ts).

import { isPinyin, syllabify } from './resegment';

/**
 * Entfernt unsichtbare Null-Breite-/Steuerzeichen, die LR zwischen die Silben
 * mischt (U+200B..U+200F Zero-Width/Richtungsmarken, U+2060 Word Joiner). Diese
 * matchen `\s` NICHT, haengen sich sonst an eine Pinyin-Silbe und zerbrechen die
 * Tokenisierung (die Silbe gilt dann nicht mehr als Pinyin).
 *
 * U+FEFF (BOM/Zero-Width No-Break Space) wird bewusst NICHT geloescht: es ist in
 * JavaScript bereits Teil von `\s` und wirkt damit als Token-Trenner. Wuerde man
 * es loeschen, klebten umliegende Tokens zusammen ("sh\u00EC\uFEFFIch" -> "sh\u00ECIch").
 * Die nachgelagerte `\s+`-Normalisierung macht daraus wie gehabt ein Leerzeichen.
 */
export function stripInvisible(s: string): string {
  return s.replace(/[\u200B-\u200F\u2060]/g, '');
}

/** Behaelt nur CJK-Ideogramme und CJK-/Vollbreiten-Satzzeichen. */
export function keepHanzi(s: string): string {
  return stripInvisible(s).replace(/[^㐀-鿿　-〿＀-￯]/g, '').trim();
}

/** Entfernt CJK-Zeichen (laesst Latein/Pinyin/Toene stehen). */
export function keepPinyin(s: string): string {
  return stripInvisible(s)
    .replace(/[㐀-鿿　-〿＀-￯]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Anzahl CJK-Ideogramme (= erwartete Zahl Pinyin-Silben). */
export function cjkCount(s: string): number {
  return (s.match(/[㐀-鿿]/g) ?? []).length;
}

/** Sieht ein Token wie eine (klein geschriebene) Pinyin-Silbe aus? */
export function looksLikePinyin(token: string): boolean {
  const t = token.replace(/[.,!?;:，。！？、]+$/u, '');
  if (!t) return false;
  if (/[A-ZÄÖÜ]/.test(t)) return false; // Uebersetzung beginnt gross -> kein Pinyin
  return /^[a-züāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+$/.test(t);
}

/**
 * LRs Uebersetzungszeile hat die Form "<volles Pinyin> <Uebersetzung>".
 * Trennt beide anhand der erwarteten Silbenzahl (hanziCount) und Pinyin-Form.
 */
export function splitPinyinTranslation(
  line: string,
  hanziCount: number,
): { pinyin: string; translation: string } {
  const cleaned = stripInvisible(line)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[㐀-鿿　-〿＀-￯\s]+/u, '');
  const words = cleaned.split(' ').filter(Boolean);
  // With a known Hanzi count, count SYLLABLES (not tokens): LR may glue two
  // syllables into one token ("depin" = 2 syllables), and stopping at the Hanzi
  // syllable count keeps a lowercase translation word (e.g. English "welcome")
  // out of the pinyin. Without a Hanzi count there is no syllable target, so
  // fall back to consuming every leading pinyin-looking token. (Word-gloss lines
  // wrapped in CJK quotes are handled upstream via isGlossLine, so no quote
  // logic is needed here.)
  const hasCount = hanziCount > 0;
  let n = 0;
  let syllables = 0;
  while (n < words.length) {
    const w = words[n];
    if (w === undefined || !isPinyin(w)) break;
    if (hasCount) {
      const add = syllabify(w).length;
      if (syllables + add > hanziCount) break; // would overshoot the Hanzi count
      syllables += add;
    }
    n++;
  }
  return { pinyin: words.slice(0, n).join(' '), translation: words.slice(n).join(' ') };
}

/**
 * True if the romanization line is an LR word-gloss rather than a sentence
 * translation: LR wraps a looked-up word's pinyin in CJK/"smart" quotes and the
 * line starts with the opening quote (e.g. “shàng gè yuè” "letzten Monat"). The
 * caller then uses splitGloss() to strip the quote markers and run the normal
 * syllable-count split, instead of the plain sentence split.
 */
export function isGlossLine(line: string): boolean {
  // Must open with a CJK/"smart" quote AND wrap pinyin - the first token after
  // the quote has to be pinyin. This excludes an ordinary quoted translation
  // (e.g. \u201CIch bin ein Neuling.\u201D), which must flow through the normal split.
  const m = /^\s*[\u201C\u2018]\s*(\S+)/u.exec(line);
  if (!m || m[1] === undefined) return false;
  // Strip quotes AND trailing/leading punctuation from the first token, so a
  // single-token gloss like \u201Ch\u01CEo\u201D, "gut" (token "h\u01CEo\u201D,") is still recognized.
  const first = m[1]
    .replace(/^[\u201C\u201D\u2018\u2019]+/u, '')
    .replace(/[\u201C\u201D\u2018\u2019.,!?;:\u2026\u00B7\uFF0C\u3002\uFF01\uFF1F\u3001]+$/u, '');
  return isPinyin(first);
}

/**
 * Extracts pinyin + translation from an LR word-gloss line by removing the gloss
 * quote markers and running the normal syllable-count split. LR writes these
 * lines messily - e.g. a two-word subtitle comes as "<q>qu nian<q> huo zhe \"X\" ...",
 * gluing the second word's pinyin and the gloss together. Stripping the markers
 * yields a plain line the split can separate into full pinyin and a clean
 * translation. Only the gloss markers are removed, so straight quotes in the
 * translation are preserved.
 */
export function splitGloss(
  line: string,
  hanziCount: number,
): { pinyin: string; translation: string } {
  return splitPinyinTranslation(line.replace(/[\u201C\u201D\u2018\u2019]/gu, ''), hanziCount);
}

/**
 * Removes LR's blanked-word placeholder ("[ __ ]") from the romanization line
 * before the pinyin/translation split - otherwise the "[" token is not pinyin,
 * the split stops there and spills the rest into the translation. Only brackets
 * containing nothing but whitespace/underscores are removed, so real bracketed
 * content (e.g. "[note]") is left untouched.
 */
export function stripBlankPlaceholders(s: string): string {
  return s.replace(/\[[\s_]*\]/g, ' ');
}

/** Schneidet fuehrende CJK und fuehrende Pinyin-Silben (die des Satzes) ab. */
export function cleanTranslation(raw: string, pinyin: string): string {
  let t = stripInvisible(raw).replace(/\s+/g, ' ').trim();
  t = t.replace(/^[㐀-鿿　-〿＀-￯\s]+/, '');
  const py = new Set(pinyin.split(/\s+/).filter(Boolean));
  if (py.size) {
    const words = t.split(' ');
    while (words.length > 0 && words[0] !== undefined && py.has(words[0])) {
      words.shift();
    }
    t = words.join(' ');
  }
  return t.trim();
}

/**
 * Trims punctuation artifacts at the very start/end of an extracted sentence.
 * LR's subtitle tokens sometimes carry leading punctuation from a neighbouring
 * segment (e.g. "，，两天前…") or a dangling trailing separator from a cut
 * subtitle ("…好朋友，"). Reading textContent pulls those into the sentence.
 *
 * Only separators and terminators are trimmed at the edges - deliberately NOT
 * quotes or brackets, which can legitimately open/close a sentence (「…」, 《…》,
 * "…"), so those are preserved. Leading: a sentence never validly starts with a
 * separator or terminator, so any such leading run is removed. Trailing: only
 * separators (comma, enumeration comma, semicolon, colon - CJK and ASCII) are
 * removed, while a trailing terminator (。！？…) is kept. Punctuation INSIDE the
 * sentence always stays.
 */
export function trimEdgePunct(s: string): string {
  return s
    .replace(/^[\s，。、；：！？…·,.;:!?]+/u, '')
    .replace(/[\s，、；：,;:]+$/u, '');
}

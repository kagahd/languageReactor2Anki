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
  // Must open with a CJK/"smart" quote, have a matching closing quote, and the
  // WHOLE span between them must be pinyin. Validating every token inside the
  // quotes (not just the first) rejects a quoted translation that merely starts
  // with a pinyin-looking word (e.g. \u201Cdie Katze\u201D - "die" looks like pinyin but
  // "Katze" does not) as well as an ordinary quoted translation (\u201CIch bin...\u201D)
  // and an unclosed quote - all of which must flow through the normal split.
  const m = /^\s*[\u201C\u2018]([^\u201C\u201D\u2018\u2019]*)[\u201D\u2019]/u.exec(line);
  if (!m || m[1] === undefined) return false;
  const inner = m[1].trim();
  if (!inner) return false;
  return inner.split(/\s+/).every((t) => isPinyin(t));
}

/**
 * Extracts pinyin + translation from an LR word-gloss line by removing ONLY the
 * gloss's own delimiter quotes - the first opening smart quote and the first
 * following closing smart quote - and running the normal syllable-count split.
 * LR writes these lines messily: a two-word subtitle comes as
 * "\u201Cq\u00F9 ni\u00E1n\u201D hu\u00F2 zh\u011B \"X\" ...", gluing the second word's pinyin after the
 * closing quote, so the remainder must be re-split by syllable count rather than
 * taken verbatim. Because only the two delimiter quotes are removed, any quotes
 * inside the translation (straight OR smart, e.g. Er sagte \u201Cgut\u201D) are preserved.
 */
export function splitGloss(
  line: string,
  hanziCount: number,
): { pinyin: string; translation: string } {
  const stripped = line
    .replace(/[\u201C\u2018]/u, '') // first opening smart quote (the gloss opener)
    .replace(/[\u201D\u2019]/u, ' '); // first closing smart quote (the gloss closer)
  return splitPinyinTranslation(stripped, hanziCount);
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

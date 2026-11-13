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
  // fall back to consuming every leading pinyin-looking token.
  const hasCount = hanziCount > 0;
  const pinyin: string[] = [];
  let syllables = 0;
  let opened = 0; // CJK/"smart" quotes opened around a pinyin gloss
  let i = 0;
  // LR wraps a word's pinyin gloss in CJK/"smart" quotes. These are peeled only
  // in the PINYIN region and kept out of the pinyin output; the translation is
  // never altered, so real quotes in any language stay intact.
  const OPEN_Q = /[\u201C\u2018]/;
  const CLOSE_Q = /[\u201D\u2019]/;
  const peel = (w: string) => w.replace(/^[\u201C\u201D\u2018\u2019]+|[\u201C\u201D\u2018\u2019]+$/gu, '');
  for (; i < words.length; i++) {
    const w = words[i];
    if (w === undefined) break;
    const token = peel(w);
    if (token === '') {
      // A pure quote token.
      if (OPEN_Q.test(w)) {
        // An opening quote is gloss markup only if a matching closing quote
        // follows AND more pinyin is still expected; otherwise it opens the
        // translation and the split stops (the quote stays in the translation).
        const hasClose = words.slice(i + 1).some((t) => CLOSE_Q.test(t));
        const moreExpected = !hasCount || syllables < hanziCount;
        if (hasClose && moreExpected) {
          opened++;
          continue;
        }
        break;
      }
      // A closing quote: consume it only if it closes a gloss we opened (even at
      // the syllable budget); otherwise it belongs to the translation.
      if (opened > 0) {
        opened--;
        continue;
      }
      break;
    }
    // isPinyin requires the token to be segmentable into real syllables, so a
    // lowercase translation word (e.g. "welcome") is not mistaken for pinyin.
    if (!isPinyin(token)) break;
    if (hasCount) {
      const add = syllabify(token).length;
      if (syllables + add > hanziCount) break; // would overshoot the Hanzi count
      syllables += add;
    }
    if (OPEN_Q.test(w)) opened++; // glued opening quote, e.g. a leading quote
    if (CLOSE_Q.test(w) && opened > 0) opened--; // glued closing quote
    pinyin.push(token);
  }
  return { pinyin: pinyin.join(' '), translation: words.slice(i).join(' ') };
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

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
  let n = 0;
  let syllables = 0;
  while (n < words.length) {
    const w = words[n];
    // isPinyin requires the token to be segmentable into real syllables, so a
    // lowercase translation word (e.g. "welcome") is not mistaken for pinyin.
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

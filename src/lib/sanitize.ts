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

/**
 * Behaelt nur CJK-Ideogramme, CJK-/Vollbreiten-Satzzeichen und ASCII-Ziffern.
 * Ziffern bleiben erhalten, damit Zahlen im Satz (z.B. "30分钟之内") nicht aus dem
 * Hanzi-Feld fallen, waehrend Pinyin/Uebersetzung sie behalten. Das stoert die
 * Silbenzaehlung nicht (cjkCount zaehlt nur Ideogramme). Vollbreiten-Ziffern
 * (０-９) lagen schon im Vollbreiten-Bereich und blieben ohnehin erhalten.
 *
 * Ein Dezimaltrenner (Punkt/Komma) ZWISCHEN zwei Ziffern bleibt erhalten, damit
 * der Zahlenwert stimmt (3.5 bleibt 3.5, wird nicht zu 35). Trenner an anderer
 * Stelle werden entfernt.
 */
export function keepHanzi(s: string): string {
  return stripInvisible(s)
    .replace(/[^0-9.,㐀-鿿　-〿＀-￯]/g, '')
    .replace(/(?<!\d)[.,]|[.,](?!\d)/g, '')
    .trim();
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

/** A tokenized subtitle line: concatenated Hanzi text, the per-word pinyin
 *  syllables, and any loose pinyin tokens (standalone spans, not attached to a
 *  Hanzi) LR renders on a separate romanization line. */
export interface SubtitleLine {
  hanzi: string;
  pinyin: string[];
  loose: string[];
}

/**
 * Selects the real sentence lines from LR's tokenized subtitle lines, dropping a
 * romanization row LR sometimes renders before the Hanzi row. Rather than a
 * fragile per-line heuristic, a line WITHOUT a CJK ideograph is dropped only
 * when its reading (word pinyin + loose pinyin tokens, compared as a multiset)
 * equals the reading of a CJK line in the same subtitle - i.e. it is a redundant
 * transliteration of that Hanzi line. This keeps numeric/unit continuation lines
 * ("30", "3.5 kg", "3.5 m") whose reading matches no Hanzi line, and removes the
 * romanization row (and its stray tokens, e.g. a bare "6" from "6岁") in both the
 * long and the single-syllable case. Falls back to all lines if every line would
 * be dropped (defensive).
 */
export function selectSentenceLines(lines: SubtitleLine[]): SubtitleLine[] {
  const hasCjk = (l: SubtitleLine) => /[㐀-鿿]/u.test(l.hanzi);
  // Normalize syllable boundaries before comparing: split on whitespace and run
  // the conservative syllabify so a grouped ("shíhòu") or glued ("depín") span
  // matches separate per-syllable entries ("shí","hòu" / "de","pín").
  const readingKey = (l: SubtitleLine) =>
    [...l.pinyin, ...l.loose]
      .flatMap((t) => t.split(/\s+/))
      .filter(Boolean)
      .flatMap((t) => syllabify(t))
      .sort()
      .join('\u0001');
  const cjkReadings = new Set(lines.filter((l) => hasCjk(l) && readingKey(l)).map(readingKey));
  const kept = lines.filter((l) => {
    if (hasCjk(l)) return true;
    const k = readingKey(l);
    return !(k && cjkReadings.has(k));
  });
  return kept.length ? kept : lines;
}

/**
 * A token made only of digits (plus optional separators), e.g. "30" or LR's
 * split "3" / "0". In a romanization line these are part of the sentence reading,
 * not the translation, and carry no pinyin syllable.
 */
export function isNumericToken(token: string): boolean {
  return /\d/.test(token) && /^[\d.,:·]+$/u.test(token);
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
 *
 * `readingDigits` is how many Arabic digit CHARACTERS the sentence reading
 * contains (taken from the Hanzi, which keeps its digits). A number in the line
 * is only consumed into the pinyin while that budget lasts; beyond it, a number
 * belongs to the translation. This disambiguates a sentence-final reading number
 * ("编号是30。" - Hanzi has "30") from a translation that merely starts with a
 * number ("三十分钟" + "30 minutes." - Hanzi has no Arabic digits). Counting
 * characters (not tokens) tolerates LR splitting "30" into "3 0".
 */
export function splitPinyinTranslation(
  line: string,
  hanziCount: number,
  readingDigits = 0,
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
  let digitsUsed = 0;
  let sawPinyin = false;
  while (n < words.length) {
    const w = words[n];
    if (w === undefined) break;
    // A number written as digits (e.g. "30", or LR's split "3 0") carries no
    // pinyin syllable. Consume it transparently - but only while the sentence
    // reading still has unaccounted digits (readingDigits). That keeps a
    // sentence-final reading number ("编号是30。" -> "biān hào shì 30.") in the
    // pinyin, yet stops a translation number ("...30 minutes.") from being pulled
    // in once the reading's own digits are used up.
    if (isNumericToken(w)) {
      const d = (w.match(/\d/g) ?? []).length;
      if (digitsUsed + d > readingDigits) break; // remaining number is translation
      digitsUsed += d;
      n++;
      continue;
    }
    if (!isPinyin(w)) break;
    if (hasCount) {
      const add = syllabify(w).length;
      if (syllables + add > hanziCount) break; // would overshoot the Hanzi count
      syllables += add;
    }
    sawPinyin = true;
    n++;
  }
  // If only numbers (and no real pinyin) were consumed, there is no pinyin
  // prefix - leave those digits with the translation rather than mislabeling
  // them as pinyin.
  if (!sawPinyin) n = 0;
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
  // Openers include the German low quote \u201E (U+201E); closers include the German
  // closing quote \u201C (U+201C), which doubles as the English/CJK opener. Each inner
  // token must be pinyin or a number ("\u201Ew\u01D2 6 su\u00EC\u2026\u201C" has a digit in the reading).
  const m = /^\s*[\u201E\u201C\u2018]([^\u201E\u201C\u201D\u2018\u2019]*)[\u201D\u201C\u2019]/u.exec(line);
  if (!m || m[1] === undefined) return false;
  const inner = m[1].trim();
  if (!inner) return false;
  const tokens = inner.split(/\s+/);
  // Every token must be pinyin or a number, AND at least one real pinyin token
  // must be present - otherwise a number-only quoted translation (e.g. \u201E30\u201C
  // Sekunden) would wrongly count as a pinyin gloss and lose its quotes.
  return tokens.some((t) => isPinyin(t)) && tokens.every((t) => isPinyin(t) || isNumericToken(t));
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
  readingDigits = 0,
): { pinyin: string; translation: string } {
  const stripped = line
    .replace(/[\u201E\u201C\u2018]/u, '') // first opening quote (incl. German \u201E and English/CJK \u201C)
    .replace(/[\u201D\u201C\u2019]/u, ' '); // first closing quote (incl. German closing \u201C)
  return splitPinyinTranslation(stripped, hanziCount, readingDigits);
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
 *
 * LR also sometimes prepends a stray, DUPLICATED number cut off by CJK
 * punctuation and then repeated as the real sentence start ("30，。30分钟之内…").
 * Only that specific artifact is removed: a leading number + CJK punctuation is
 * stripped ONLY when the same digits immediately follow it. A meaningful leading
 * number (a list marker "1、准备好。", a response "30，没错。", or a plain "30分钟")
 * is therefore kept.
 */
export function trimEdgePunct(s: string): string {
  return s
    .replace(/^(\d+)[，。、；：！？…·]+(?=\1)/u, '')
    .replace(/^[\s，。、；：！？…·,.;:!?]+/u, '')
    .replace(/[\s，、；：,;:]+$/u, '');
}

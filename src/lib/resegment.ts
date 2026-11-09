// Re-splits pinyin syllables that Language Reactor glues together in the sentence
// romanization (e.g. "depin" for 的频 -> "de" + "pin"). The valid syllable set is
// built from initials x finals at load time, so this file stays compact. The
// caller only applies a re-segmentation when it yields exactly the expected
// syllable count (= number of Hanzi), so an ambiguous split can never mangle a
// correct token - it is simply discarded.

const INITIALS = [
  '', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h',
  'j', 'q', 'x', 'zh', 'ch', 'sh', 'r', 'z', 'c', 's', 'y', 'w',
];

const FINALS = [
  'a', 'o', 'e', 'ai', 'ei', 'ao', 'ou', 'an', 'en', 'ang', 'eng', 'ong', 'er',
  'i', 'ia', 'ie', 'iao', 'iu', 'ian', 'in', 'iang', 'ing', 'iong',
  'u', 'ua', 'uo', 'uai', 'ui', 'uan', 'un', 'uang', 'ueng',
  'v', 've', 'van', 'vn',
];

// Built from initials x finals (this already yields "er", "a", "o", "e", ... via
// the empty initial). Standalone-consonant interjections ("n", "ng", "m") are
// intentionally excluded: they virtually never occur as separate syllables in
// sentence romanization and would otherwise create spurious ambiguity (e.g.
// "pin" = "pi"+"n"), blocking the unambiguous-only split below.
//
// The cross product also contains some combinations that are not real Mandarin
// syllables (e.g. "fe"). That is harmless here: every REAL syllable is in the
// set too, so the correct segmentation is always a candidate. A spurious
// alternative built from an invalid "syllable" can only make a token look
// AMBIGUOUS (>=2 segmentations) - and the caller then refuses to split it. It
// can never become the single accepted segmentation that produces a wrong split.
const SYLLABLES: ReadonlySet<string> = new Set(
  INITIALS.flatMap((i) => FINALS.map((f) => i + f)),
);

// Map a tone-marked vowel (and the rare toned n) to its plain base letter;
// the umlaut u is normalized to "v" to match the FINALS above.
const TONE_TO_BASE: Record<string, string> = {
  ā: 'a', á: 'a', ǎ: 'a', à: 'a',
  ē: 'e', é: 'e', ě: 'e', è: 'e', ê: 'e',
  ī: 'i', í: 'i', ǐ: 'i', ì: 'i',
  ō: 'o', ó: 'o', ǒ: 'o', ò: 'o',
  ū: 'u', ú: 'u', ǔ: 'u', ù: 'u',
  ü: 'v', ǖ: 'v', ǘ: 'v', ǚ: 'v', ǜ: 'v',
  ń: 'n', ň: 'n', ǹ: 'n',
};

/** Strips tone diacritics (1:1 per character, so lengths stay aligned). */
function toneless(s: string): string {
  return Array.from(s)
    .map((c) => TONE_TO_BASE[c] ?? c)
    .join('')
    .toLowerCase();
}

/** Collects up to `limit` distinct valid syllable segmentations (as length
 *  arrays). Stops early once `limit` is reached - we only need to know whether
 *  a segmentation is unique (1) or ambiguous (>=2). */
function segmentations(s: string, limit: number): number[][] {
  const results: number[][] = [];
  const walk = (rest: string, acc: number[]): void => {
    if (results.length >= limit) return;
    if (rest.length === 0) {
      results.push([...acc]);
      return;
    }
    for (let len = Math.min(6, rest.length); len >= 1; len--) {
      if (SYLLABLES.has(rest.slice(0, len))) {
        acc.push(len);
        walk(rest.slice(len), acc);
        acc.pop();
        if (results.length >= limit) return;
      }
    }
  };
  walk(s, []);
  return results;
}

/** Splits one pinyin word into its syllables - but ONLY when the split is
 *  unambiguous (exactly one valid segmentation). Returns [word] unchanged if the
 *  token is not pinyin, not segmentable, already a single syllable, or
 *  ambiguous (e.g. "fangan" = "fang-an" vs "fan-gan"), so an uncertain guess is
 *  never applied. */
export function syllabify(word: string): string[] {
  // Pinyin syllables are lowercase; a token with any uppercase letter (e.g. a
  // stray translation word) is not ours to split.
  if (/[A-Z]/.test(word)) return [word];
  const tl = toneless(word);
  if (!/^[a-z]+$/.test(tl)) return [word]; // non-pinyin (punctuation, digits, ...)
  const segs = segmentations(tl, 2);
  if (segs.length !== 1) return [word]; // 0 = unsegmentable, >=2 = ambiguous
  const lens = segs[0];
  if (!lens || lens.length <= 1) return [word];
  const out: string[] = [];
  let i = 0;
  for (const l of lens) {
    out.push(word.slice(i, i + l));
    i += l;
  }
  return out;
}

/**
 * Re-segments space-separated pinyin so each token is a single syllable, but
 * only returns the result when it has exactly `expected` syllables (= Hanzi
 * count). Otherwise returns null and the caller keeps the original - so a wrong
 * guess is never applied.
 */
export function resegmentPinyin(pinyin: string, expected: number): string | null {
  if (!pinyin || expected <= 0) return null;
  const tokens = pinyin.split(/\s+/).filter(Boolean);
  const out = tokens.flatMap(syllabify);
  return out.length === expected ? out.join(' ') : null;
}

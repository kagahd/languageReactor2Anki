// Reine Bereinigungs-Funktionen, die saubere Felder erzwingen, obwohl LR Pinyin
// in die Hanzi-/Uebersetzungszeile mischt. Bewusst DOM-frei und ohne Seiteneffekte,
// damit sie als Unit-Tests pruefbar sind (siehe sanitize.test.ts).

/**
 * Entfernt unsichtbare Null-Breite-/Steuerzeichen, die LR zwischen die Silben
 * mischt (U+200B..U+200F Zero-Width/Richtungsmarken, U+2060 Word Joiner,
 * U+FEFF BOM). Sie matchen `\s` NICHT, haengen sich sonst an eine Pinyin-Silbe
 * und zerbrechen die Tokenisierung (die Silbe gilt dann nicht mehr als Pinyin).
 */
export function stripInvisible(s: string): string {
  return s.replace(/[\u200B-\u200F\u2060\uFEFF]/g, '');
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
  const cap = hanziCount > 0 ? hanziCount : words.length;
  let n = 0;
  while (n < words.length && n < cap) {
    const w = words[n];
    if (w === undefined || !looksLikePinyin(w)) break;
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

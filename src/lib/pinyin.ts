// Tonerkennung fuer Pinyin mit Diakritika und Einfaerbung pro Silbe.

const TONE_MARKS: Record<number, string> = {
  1: 'āēīōūǖĀĒĪŌŪǕ',
  2: 'áéíóúǘÁÉÍÓÚǗńŃ',
  3: 'ǎěǐǒǔǚǍĚǏǑǓǙ',
  4: 'àèìòùǜÀÈÌÒÙǛǹǸ',
};

/** Ton einer Pinyin-Silbe (1-4), sonst 5 (neutral/ohne Markierung). */
export function toneOf(syllable: string): number {
  for (const t of [1, 2, 3, 4]) {
    const marks = TONE_MARKS[t] ?? '';
    for (const ch of marks) {
      if (syllable.includes(ch)) return t;
    }
  }
  return 5;
}

/**
 * Umgibt jede Silbe mit <span class="toneN">. Trennzeichen/Leerzeichen bleiben
 * erhalten. `esc` escaped den Silbentext fuer die HTML-Ausgabe.
 */
export function toneColorize(pinyin: string, esc: (s: string) => string): string {
  if (!pinyin) return '';
  return pinyin
    .split(/(\s+)/)
    .map((tok) => {
      if (tok === '' || /^\s+$/.test(tok)) return tok;
      return `<span class="tone${toneOf(tok)}">${esc(tok)}</span>`;
    })
    .join('');
}

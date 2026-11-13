import { SEL } from './selectors';
import {
  cjkCount,
  cleanTranslation,
  isGlossLine,
  keepHanzi,
  parseGloss,
  keepPinyin,
  splitPinyinTranslation,
  stripBlankPlaceholders,
  stripInvisible,
  trimEdgePunct,
} from './sanitize';
import { resegmentPinyin } from './resegment';
import type { Meaning, Sentence, VideoSource, VocabCard } from './types';

/** textContent, unsichtbare Zero-Width-Zeichen entfernt, Mehrfach-Whitespace zu
 *  einem Space normalisiert, getrimmt. */
function txt(el: Element | null | undefined): string {
  return stripInvisible(el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Nur die direkten Textknoten eines Elements (ohne Kinder), ohne Whitespace. */
function directText(el: Element): string {
  let s = '';
  el.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) s += n.textContent ?? '';
  });
  return stripInvisible(s).replace(/\s+/g, '').trim();
}

/** Hanzi aus einem data-word-key wie "WORD|新手|zh-CN". */
function hanziFromKey(word: Element): string {
  const key = word.getAttribute('data-word-key');
  return key ? key.split('|')[1] ?? '' : '';
}

/**
 * Liest die Tokens eines Satz-Containers (`.lln-subs-text` oder `.lln-sub-text`)
 * und baut Hanzi (ohne Leerzeichen) sowie Pinyin (silbenweise, Space-getrennt).
 */
function readTokens(subText: Element): { hanzi: string; pinyin: string } {
  let hanzi = '';
  const pinyinParts: string[] = [];

  const tokens = subText.querySelectorAll(`:scope > ${SEL.word}, :scope > ${SEL.notWord}`);
  tokens.forEach((tok) => {
    if (tok.classList.contains(SEL.notWord.slice(1))) {
      // Satzzeichen
      hanzi += txt(tok);
      return;
    }
    const inners = tok.querySelectorAll(`:scope > ${SEL.translitInnerWrap}`);
    if (inners.length) {
      inners.forEach((w) => {
        hanzi += directText(w);
        const tr = w.querySelector(`:scope > ${SEL.translit}`);
        if (tr) pinyinParts.push(txt(tr));
      });
    } else {
      // Beispiel-Tokens haben oft nur Klartext-Hanzi ohne Translit-Wrap.
      hanzi += hanziFromKey(tok) || txt(tok);
    }
  });

  return { hanzi, pinyin: pinyinParts.join(' ') };
}

function extractSentence(root: ParentNode): Sentence | null {
  const subText = root.querySelector(SEL.subtitleText);
  // Drop LR's blanked-word placeholder ("[ __ ]") before splitting pinyin/translation.
  const rawWithBlanks = txt(root.querySelector(SEL.sentenceTranslation));
  // Each blanked placeholder stands for one syllable LR removed from the line.
  const blankCount = (rawWithBlanks.match(/\[[\s_]*\]/g) ?? []).length;
  const rawLine = stripBlankPlaceholders(rawWithBlanks);
  const tokens = subText ? readTokens(subText) : { hanzi: '', pinyin: '' };

  // trimEdgePunct: LR's subtitle tokens can carry leading punctuation from a
  // neighbouring segment ("，，两天前…") or a dangling trailing separator from a
  // cut subtitle ("…好朋友，"). Those edge commas are not part of the sentence.
  const hanzi = trimEdgePunct(keepHanzi(tokens.hanzi));
  const translitPinyin = keepPinyin(tokens.pinyin);

  const syllableCount = cjkCount(hanzi);

  let rawPinyin: string;
  let rawTranslation: string;
  if (isGlossLine(rawLine)) {
    // LR shows a word-gloss "“<pinyin>” <translation>". Take the pinyin from
    // inside the quotes and the translation from after them - the subtitle
    // translit is often incomplete for these lines.
    const g = parseGloss(rawLine);
    rawPinyin = g.pinyin || translitPinyin;
    rawTranslation = g.translation;
  } else if (syllableCount > 0 && blankCount >= syllableCount) {
    // Every pinyin syllable was a blanked placeholder: there is no pinyin to
    // take from the romanization line, so the whole remainder is translation.
    // (Passing budget 0 to the splitter would instead select its "unknown
    // count" fallback and pull a translation word into the pinyin.)
    rawPinyin = translitPinyin;
    rawTranslation = rawLine;
  } else {
    // Blanked syllables are gone from the romanization, so lower the pinyin
    // budget by that many - otherwise the split would pull a translation word
    // into the pinyin to fill the count (e.g. French "ma"). When the Hanzi count
    // is unknown (0), the splitter's token-based fallback is used as before.
    const budget = syllableCount > 0 ? syllableCount - blankCount : 0;
    const split = splitPinyinTranslation(rawLine, budget);
    // Prefer the full pinyin from the romanization line, else subtitle translit.
    rawPinyin = split.pinyin || translitPinyin;
    rawTranslation = split.translation || cleanTranslation(rawLine, translitPinyin);
  }

  // LR glues syllables in the romanization sometimes ("depin" -> "de pin"); only
  // apply the re-segmentation when it yields exactly the Hanzi syllable count.
  const pinyin = trimEdgePunct(resegmentPinyin(rawPinyin, syllableCount) ?? rawPinyin);
  // trimEdgePunct also on the translation: a sentence-final period can arrive as
  // a separate token and land at the START of the translation ("。/. Mir ist…").
  const translation = trimEdgePunct(rawTranslation);

  if (!hanzi && !translation) return null;
  return { hanzi, pinyin, translation };
}

function extractMeanings(dict: Element): Meaning[] {
  const sec = dict.querySelector(SEL.sectionFull);
  if (!sec) return [];
  const out: Meaning[] = [];
  sec.querySelectorAll('div').forEach((div) => {
    const spans = div.querySelectorAll(':scope > span');
    if (!spans.length) return; // Wrapper- und Kopf-Divs ueberspringen
    const first = txt(spans[0]);
    const m = first.match(/^\(([^)]*)\)$/);
    const pos = m && spans.length > 1 ? m[1] : undefined;
    const text = Array.from(spans)
      .slice(pos ? 1 : 0)
      .map(txt)
      .filter(Boolean)
      .join(' ');
    if (!text) return;
    // Rein chinesische Zeilen sind LR-Synonyme, keine Uebersetzungen -> auslassen.
    if (/[㐀-鿿]/.test(text) && !/[A-Za-zÀ-ÿ]/.test(text)) return;
    out.push(pos ? { pos, text } : { text });
  });
  return out;
}

function extractVideoSource(doc: Document): VideoSource {
  const url = doc.location.href;
  let videoId: string | undefined;
  try {
    videoId = new URL(url).searchParams.get('v') ?? undefined;
  } catch {
    videoId = undefined;
  }
  const video = doc.querySelector('video');
  const time =
    video && Number.isFinite(video.currentTime) ? Math.floor(video.currentTime) : undefined;
  return { url, videoId, time };
}

export interface CardIssues {
  /** Fehlende Pflichtfelder - Karte sollte NICHT angelegt werden. */
  critical: string[];
  /** Fehlende Zusatzfelder - Karte ist anlegbar, aber unvollstaendig. */
  warnings: string[];
}

/**
 * Prueft, ob die Extraktion plausibel vollstaendig ist. Schlaegt an, wenn ein
 * LR-Update die DOM-Struktur veraendert hat und Felder leer bleiben.
 */
export function validateVocabCard(card: VocabCard): CardIssues {
  const critical: string[] = [];
  const warnings: string[] = [];
  if (!card.hanzi) critical.push('Hanzi');
  if (!card.contextualTranslation && card.meanings.length === 0) critical.push('translation');
  if (!card.pinyin) warnings.push('Pinyin');
  if (!card.sentence || !card.sentence.hanzi) warnings.push('example sentence');
  return { critical, warnings };
}

/**
 * Extrahiert die aktuell im LR-Side-Panel angezeigte Vokabel.
 * Gibt null zurueck, wenn kein Woerterbuch-Panel geoeffnet ist.
 */
export function extractVocabCard(doc: Document = document): VocabCard | null {
  const dict = doc.querySelector(SEL.dictWrap);
  if (!dict) return null;

  const hanzi = keepHanzi(txt(dict.querySelector(SEL.dictWord)));
  if (!hanzi) return null;

  const pinyin = keepPinyin(txt(dict.querySelector(SEL.dictTranslit)));

  return {
    hanzi,
    pinyin,
    contextualTranslation: cleanTranslation(txt(dict.querySelector(SEL.contextualTrans)), pinyin),
    meanings: extractMeanings(dict),
    frequencyRank: txt(dict.querySelector(SEL.rankText)) || undefined,
    sentence: extractSentence(doc),
    source: extractVideoSource(doc),
    capturedAt: new Date().toISOString(),
  };
}

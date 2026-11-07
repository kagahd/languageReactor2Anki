import { SEL } from './selectors';
import {
  cjkCount,
  cleanTranslation,
  keepHanzi,
  keepPinyin,
  splitPinyinTranslation,
} from './sanitize';
import type { Meaning, Sentence, VideoSource, VocabCard } from './types';

/** textContent, Mehrfach-Whitespace zu einem Space normalisiert, getrimmt. */
function txt(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Nur die direkten Textknoten eines Elements (ohne Kinder), ohne Whitespace. */
function directText(el: Element): string {
  let s = '';
  el.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) s += n.textContent ?? '';
  });
  return s.replace(/\s+/g, '').trim();
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
  const rawLine = txt(root.querySelector(SEL.sentenceTranslation));
  const tokens = subText ? readTokens(subText) : { hanzi: '', pinyin: '' };

  const hanzi = keepHanzi(tokens.hanzi);
  const translitPinyin = keepPinyin(tokens.pinyin);

  const split = splitPinyinTranslation(rawLine, cjkCount(hanzi));
  // Volles Pinyin bevorzugen (aus der Uebersetzungszeile), sonst Untertitel-Translit.
  const pinyin = split.pinyin || translitPinyin;
  const translation = split.translation || cleanTranslation(rawLine, translitPinyin);

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

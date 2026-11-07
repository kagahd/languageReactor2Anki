import type { VocabCard } from '../types';
import type { Settings } from '../settings';
import { ankiInvoke, ensureDeck } from './connect';
import { CARD_TEMPLATES, ensureModel } from './model';
import { ensureLibraryMedia, fetchStrokeData } from './strokes';
import { toneColorize } from '../pinyin';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Baut die vollstaendige Bedeutungsliste als HTML, dedupliziert und ohne die
 *  Zeile, die bereits als Kontext-Uebersetzung oben steht. */
function formatMeanings(card: VocabCard): string {
  const seen = new Set<string>();
  const ctx = card.contextualTranslation.trim();
  const items: string[] = [];
  for (const m of card.meanings) {
    const key = `${m.pos ?? ''}|${m.text}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (!m.pos && m.text.trim() === ctx) continue; // Dublette zur Kontext-Uebersetzung
    const pos = m.pos ? `<span class="pos">${esc(m.pos)}</span> ` : '';
    items.push(`<li>${pos}${esc(m.text)}</li>`);
  }
  return items.length ? `<ul>${items.join('')}</ul>` : '';
}

function formatSource(card: VocabCard): string {
  const { url, videoId, time } = card.source;
  if (videoId) {
    const t = time ?? 0;
    const href = `https://youtu.be/${videoId}?t=${t}`;
    // Volle URL sichtbar und klickbar, plus lesbarer Zeitstempel.
    return `<a href="${esc(href)}">${esc(href)}</a> <span class="quelle-zeit">(@ ${formatTime(t)})</span>`;
  }
  return `<a href="${esc(url)}">${esc(url)}</a>`;
}

export function buildFields(card: VocabCard): Record<string, string> {
  return {
    Hanzi: esc(card.hanzi),
    Pinyin: toneColorize(card.pinyin, esc),
    Meaning: esc(card.contextualTranslation),
    Meanings: formatMeanings(card),
    SentenceHanzi: esc(card.sentence?.hanzi ?? ''),
    SentencePinyin: toneColorize(card.sentence?.pinyin ?? '', esc),
    SentenceTranslation: esc(card.sentence?.translation ?? ''),
    Source: formatSource(card),
    Frequency: esc(card.frequencyRank ?? ''),
    StrokeData: '',
  };
}

export interface AddNoteResult {
  noteId: number;
}

function subdecksFor(deckName: string): string[] {
  return CARD_TEMPLATES.map((t) => `${deckName}::${t.Name}`);
}

// Deck, note type, subdecks and the HanziWriter library only need to be set up
// once. Cache that per settings signature so every add doesn't repeat ~10 calls
// (incl. re-applying templates/styling, which gets slower as the deck grows).
let setupKey: string | null = null;
let setupPromise: Promise<void> | null = null;

async function ensureSetup(settings: Settings): Promise<void> {
  const { ankiUrl, deckName, modelName, toneColors } = settings;
  const key = `${ankiUrl}|${deckName}|${modelName}|${toneColors}`;
  if (setupKey === key && setupPromise) return setupPromise;

  setupKey = key;
  setupPromise = (async () => {
    await ensureDeck(deckName, ankiUrl);
    await ensureModel(modelName, ankiUrl, toneColors);
    for (const d of subdecksFor(deckName)) await ensureDeck(d, ankiUrl);
    await ensureLibraryMedia(ankiUrl);
  })();
  // On failure, clear the cache so the next add retries the setup.
  setupPromise.catch(() => {
    if (setupKey === key) {
      setupKey = null;
      setupPromise = null;
    }
  });
  return setupPromise;
}

/**
 * Orchestriert das Anlegen einer Karte: Setup (gecacht) + Note anlegen.
 * Wirft AnkiConnectError bei Problemen (inkl. Dubletten).
 */
export async function addCard(card: VocabCard, settings: Settings): Promise<AddNoteResult> {
  const { ankiUrl, deckName } = settings;

  await ensureSetup(settings);
  const subdeckByOrd = subdecksFor(deckName);

  // Strichfolge-Daten offline einbetten (gecacht pro Zeichen).
  // Fehlschlaege hier sind nicht kritisch - die Karte wird trotzdem angelegt.
  const fields = buildFields(card);
  try {
    const strokeData = await fetchStrokeData(card.hanzi);
    if (Object.keys(strokeData).length > 0) {
      fields.StrokeData = JSON.stringify(strokeData);
    }
  } catch (e) {
    console.warn('[lr2anki] Could not load stroke data:', e);
  }

  const note = {
    deckName,
    modelName: settings.modelName,
    fields,
    tags: ['language-reactor', card.source.videoId ?? 'youtube'].filter(Boolean),
    options: { allowDuplicate: false, duplicateScope: 'deck' },
  };

  const noteId = await ankiInvoke<number>('addNote', { note }, ankiUrl);
  await routeCardsToSubdecks(noteId, subdeckByOrd, deckName, ankiUrl);
  return { noteId };
}

/** Verschiebt die frisch erzeugten Karten anhand ihres Template-Index (ord)
 *  in die passenden Subdecks. Fehler hier sind nicht kritisch. */
async function routeCardsToSubdecks(
  noteId: number,
  subdeckByOrd: string[],
  fallbackDeck: string,
  baseUrl: string,
): Promise<void> {
  try {
    const cardIds = await ankiInvoke<number[]>('findCards', { query: `nid:${noteId}` }, baseUrl);
    if (!cardIds.length) return;
    const info = await ankiInvoke<Array<{ cardId: number; ord: number }>>(
      'cardsInfo',
      { cards: cardIds },
      baseUrl,
    );
    const byDeck = new Map<string, number[]>();
    for (const c of info) {
      const deck = subdeckByOrd[c.ord] ?? fallbackDeck;
      const list = byDeck.get(deck) ?? [];
      list.push(c.cardId);
      byDeck.set(deck, list);
    }
    for (const [deck, ids] of byDeck) {
      await ankiInvoke('changeDeck', { cards: ids, deck }, baseUrl);
    }
  } catch (e) {
    console.warn('[lr2anki] Failed to assign subdecks:', e);
  }
}

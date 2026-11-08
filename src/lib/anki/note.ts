import type { VocabCard } from '../types';
import type { Settings } from '../settings';
import { AnkiConnectError, ankiInvoke, ensureDeck } from './connect';
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

export type AddCardResult = { noteId: number } | { duplicate: true };

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

/** Drops the cached setup so the next add re-creates deck/model/subdecks/media.
 *  Used to self-heal when the user deleted the deck or note type in Anki. */
function invalidateSetup(): void {
  setupKey = null;
  setupPromise = null;
}

/**
 * Orchestriert das Anlegen einer Karte: Setup (gecacht) + Note anlegen.
 * Wirft AnkiConnectError bei Problemen (inkl. Dubletten).
 */
// Serialize adds so the duplicate check and the insert form one critical section:
// two concurrent ADD_CARD messages must not both pass the check and then insert.
let addQueue: Promise<unknown> = Promise.resolve();

export function addCard(card: VocabCard, settings: Settings): Promise<AddCardResult> {
  const run = addQueue.then(
    () => addCardImpl(card, settings),
    () => addCardImpl(card, settings),
  );
  // Keep the chain alive regardless of this call's outcome.
  addQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function addCardImpl(card: VocabCard, settings: Settings): Promise<AddCardResult> {
  const { ankiUrl, deckName } = settings;

  await ensureSetup(settings);
  const subdeckByOrd = subdecksFor(deckName);

  const fields = buildFields(card);

  // Skip identical duplicates: same word AND same meaning/sentence. Differences
  // in source timestamp, frequency or stroke data do not count as "different".
  // If the lookup itself fails, propagate the error instead of inserting blind -
  // otherwise a transient failure could create a duplicate.
  if (await isDuplicate(fields, settings)) return { duplicate: true };

  // Strichfolge-Daten offline einbetten (gecacht pro Zeichen).
  // Fehlschlaege hier sind nicht kritisch - die Karte wird trotzdem angelegt.
  try {
    const strokeData = await fetchStrokeData(card.hanzi);
    if (Object.keys(strokeData).length > 0) {
      fields.StrokeData = JSON.stringify(strokeData);
    }
  } catch (e) {
    console.warn('[lr2anki] Could not load stroke data:', e);
  }

  const note: Record<string, unknown> = {
    deckName,
    modelName: settings.modelName,
    fields,
    tags: ['language-reactor', card.source.videoId ?? 'youtube'].filter(Boolean),
    // Our own content-based check ran above; let Anki add it. (Same Hanzi with a
    // different sentence/translation is intentionally allowed as a new card.)
    options: { allowDuplicate: true },
  };

  try {
    const noteId = await createNote(note, subdeckByOrd, deckName, ankiUrl);
    return { noteId };
  } catch (e) {
    // Self-heal: if the deck or note type was deleted in Anki since the cached
    // setup ran, re-create everything and retry once.
    if (e instanceof AnkiConnectError && /was not found/i.test(e.message)) {
      invalidateSetup();
      await ensureSetup(settings);
      const noteId = await createNote(note, subdeckByOrd, deckName, ankiUrl);
      return { noteId };
    }
    throw e;
  }
}

/** True if a note with identical content already exists (same Hanzi plus the
 *  same meaning and sentence fields). Source timestamp, frequency and stroke
 *  data are ignored, so re-clipping the same word in a different sentence is
 *  allowed, but an exact repeat is skipped. */
async function isDuplicate(
  fields: Record<string, string>,
  settings: Settings,
): Promise<boolean> {
  const { ankiUrl, modelName } = settings;
  // Escape search-string delimiters; the model name is user-editable and may
  // contain quotes or backslashes that would otherwise break the query.
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const query = `"note:${esc(modelName)}" "Hanzi:${esc(fields.Hanzi ?? '')}"`;
  const ids = await ankiInvoke<number[]>('findNotes', { query }, ankiUrl);
  if (ids.length === 0) return false;

  const infos = await ankiInvoke<Array<{ fields: Record<string, { value: string }> }>>(
    'notesInfo',
    { notes: ids },
    ankiUrl,
  );
  const keys = [
    'Hanzi',
    'Pinyin',
    'Meaning',
    'Meanings',
    'SentenceHanzi',
    'SentencePinyin',
    'SentenceTranslation',
  ];
  return infos.some((info) =>
    keys.every((k) => (info.fields[k]?.value ?? '') === (fields[k] ?? '')),
  );
}

async function createNote(
  note: Record<string, unknown>,
  subdeckByOrd: string[],
  deckName: string,
  ankiUrl: string,
): Promise<number> {
  const noteId = await ankiInvoke<number>('addNote', { note }, ankiUrl);
  await routeCardsToSubdecks(noteId, subdeckByOrd, deckName, ankiUrl);
  return noteId;
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

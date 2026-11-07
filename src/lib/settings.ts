import { browser } from 'wxt/browser';

export interface Settings {
  /** Basis-URL der AnkiConnect-API. */
  ankiUrl: string;
  /** Ziel-Deck (:: erzeugt Unterdecks). */
  deckName: string;
  /** Name des Anki-Notiztyps. */
  modelName: string;
  /** TTS-Aussprache in die Karte einbauen. */
  tts: boolean;
  /** Pinyin-Silben nach Ton einfaerben. */
  toneColors: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  ankiUrl: 'http://127.0.0.1:8765',
  deckName: 'Chinese::Language Reactor',
  modelName: 'Language Reactor Chinese',
  tts: true,
  toneColors: true,
};

export async function getSettings(): Promise<Settings> {
  const stored = await browser.storage.sync.get('settings');
  const partial = (stored.settings as Partial<Settings> | undefined) ?? {};
  return { ...DEFAULT_SETTINGS, ...partial };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await browser.storage.sync.set({ settings: next });
  return next;
}

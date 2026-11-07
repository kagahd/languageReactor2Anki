import { browser } from 'wxt/browser';
import { getSettings, saveSettings, type Settings } from '../../lib/settings';
import type { SyncModelResponse } from '../../lib/messages';

function $(id: string): HTMLInputElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} fehlt`);
  return el as HTMLInputElement;
}

function setStatus(text: string, kind: 'ok' | 'err' | ''): void {
  const s = document.getElementById('status');
  if (!s) return;
  s.textContent = text;
  s.className = kind;
}

async function load(): Promise<void> {
  const s = await getSettings();
  $('ankiUrl').value = s.ankiUrl;
  $('deckName').value = s.deckName;
  $('modelName').value = s.modelName;
  $('toneColors').checked = s.toneColors;
  $('tts').checked = s.tts;
}

async function save(): Promise<void> {
  const btn = $('save');
  btn.disabled = true;
  setStatus('Saving …', '');

  const patch: Partial<Settings> = {
    ankiUrl: $('ankiUrl').value.trim() || undefined,
    deckName: $('deckName').value.trim() || undefined,
    modelName: $('modelName').value.trim() || undefined,
    toneColors: $('toneColors').checked,
    tts: $('tts').checked,
  };
  // leere Textfelder nicht ueberschreiben
  for (const k of Object.keys(patch) as (keyof Settings)[]) {
    if (patch[k] === undefined) delete patch[k];
  }

  await saveSettings(patch);

  // Styling sofort in Anki anwenden (best effort - Anki muss laufen).
  let note = 'Saved.';
  try {
    const res = (await browser.runtime.sendMessage({ type: 'SYNC_MODEL' })) as SyncModelResponse;
    note = res.ok
      ? 'Saved and applied to Anki.'
      : `Saved. Anki not updated: ${res.error}`;
  } catch {
    note = 'Saved. (Anki not reachable - will apply on the next card you add.)';
  }

  setStatus(note, 'ok');
  btn.disabled = false;
}

document.addEventListener('DOMContentLoaded', () => {
  void load();
  $('save').addEventListener('click', () => void save());
});

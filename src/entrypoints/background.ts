import { browser } from 'wxt/browser';
import { getSettings } from '../lib/settings';
import { ankiRequestPermission, ankiVersion } from '../lib/anki/connect';
import { addCard } from '../lib/anki/note';
import { ensureModel } from '../lib/anki/model';
import type {
  AddCardResponse,
  Message,
  PingResponse,
  SyncModelResponse,
} from '../lib/messages';

export default defineBackground(() => {
  console.log('[lr2anki] background service worker started.');

  browser.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
    void handle(msg).then(sendResponse);
    return true; // asynchrone Antwort
  });
});

async function handle(
  msg: Message,
): Promise<AddCardResponse | PingResponse | SyncModelResponse> {
  const settings = await getSettings();
  try {
    await ankiRequestPermission(settings.ankiUrl);
    if (msg.type === 'PING') {
      const version = await ankiVersion(settings.ankiUrl);
      return { ok: true, version };
    }
    if (msg.type === 'ADD_CARD') {
      const result = await addCard(msg.card, settings);
      if ('duplicate' in result) return { ok: true, duplicate: true };
      return { ok: true, noteId: result.noteId };
    }
    if (msg.type === 'SYNC_MODEL') {
      await ensureModel(settings.modelName, settings.ankiUrl, settings.toneColors);
      return { ok: true };
    }
    return { ok: false, error: 'Unknown message type.' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

import { defineConfig } from 'wxt';

// https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'languageReactor2Anki',
    description:
      'Save Chinese vocabulary from Language Reactor on YouTube as rich Anki cards (Hanzi, Pinyin, translation, example sentence) via AnkiConnect.',
    // 'storage' fuer Einstellungen; Host-Permission fuer die lokale AnkiConnect-API.
    permissions: ['storage'],
    host_permissions: [
      'http://127.0.0.1:8765/*',
      'http://localhost:8765/*',
      'https://cdn.jsdelivr.net/*',
    ],
  },
});

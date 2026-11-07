# Privacy Policy

_Last updated: 2026-11-07_

**languageReactor2Anki** does not collect, transmit, or sell any personal data. There are no
analytics, no tracking, and no developer-operated servers.

## What the extension does with data

- **Your settings** (AnkiConnect URL, deck name, note type, tone-colors and TTS toggles) are stored
  locally in your browser via `chrome.storage` and never leave your device except through your own
  Anki sync if you choose to use it.
- **Vocabulary you capture** (the word, Pinyin, translation, sentence, source link) is read from the
  page you are viewing and sent only to **your own local Anki Desktop** through the AnkiConnect
  add-on (`http://127.0.0.1:8765`). It is not sent anywhere else.
- **Stroke-order data** for the characters you save is fetched from the public jsDelivr CDN
  (`cdn.jsdelivr.net`) and cached locally. These are plain data requests for character drawing data;
  no personal information is included.

## What the extension does NOT do

- It does not collect your identity, browsing history, or usage statistics.
- It does not send any data to the author or to third parties (other than the character-data request
  to jsDelivr described above).
- It does not run remote code.

## Permissions

- `storage` - to save your settings locally.
- Host access to `127.0.0.1`/`localhost` (AnkiConnect) and `cdn.jsdelivr.net` (stroke-order data).
- Host access to `youtube.com` - the content script runs there to read Language Reactor's panel.

## Contact

Questions: open an issue at https://github.com/kagahd/languageReactor2Anki

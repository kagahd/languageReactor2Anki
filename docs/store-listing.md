# Chrome Web Store listing (draft)

Copy/paste material for the store submission. Not shipped with the extension.

## Name
languageReactor2Anki

## Short description (<= 132 chars)
Save Chinese vocabulary from Language Reactor on YouTube as rich Anki cards: Hanzi, Pinyin,
translation, examples, stroke order.

## Category
Education

## Detailed description
languageReactor2Anki turns Chinese words you meet while watching YouTube with Language Reactor into
high-quality Anki cards with a single click.

Click a word in Language Reactor, then press the "+ Anki" button in its dictionary panel. The
extension creates a card in your running Anki Desktop (via the AnkiConnect add-on) with:

- the word (Hanzi) and its Pinyin, with optional tap-to-reveal Pinyin and tone colors
- the translation and full meaning list
- the current subtitle sentence (Hanzi, Pinyin, translation)
- offline stroke-order animations for each character
- pronunciation via Anki's built-in text-to-speech
- a timestamped link back to the exact moment in the video

Cards are tri-directional from a single note (Reading, Translating, Listening), each in its own
subdeck, so you can train each skill separately. Everything stays on your device; no account, no
tracking.

Requirements: Anki Desktop with the AnkiConnect add-on, and the Language Reactor extension.

Note: this is an independent tool, not affiliated with Language Reactor, YouTube/Google, or Anki.
For personal language-learning use.

## Single purpose
Create Anki flashcards from the Chinese vocabulary shown by Language Reactor on YouTube.

## Permission justifications
- **storage**: store the user's settings (AnkiConnect URL, deck/note-type names, toggles) locally.
- **host `127.0.0.1` / `localhost` (8765)**: send cards to the user's own Anki via the AnkiConnect
  local API.
- **host `cdn.jsdelivr.net`**: download character stroke-order data (data only, no code).
- **content script on `youtube.com`**: read the Language Reactor dictionary panel and inject the
  "+ Anki" button.

No remote code is executed. No user data is collected or transmitted to the author.

## Privacy policy URL
https://github.com/kagahd/languageReactor2Anki/blob/main/PRIVACY.md

## Screenshots
Use the images in `docs/screenshots/` (youtubeLR.png, ReadingCardQuestion/Answer.png,
TranslatingCardQuestion.png, AnkiStack.png, AnkiMobileLight/Dark.jpg). The store wants 1280x800 or
640x400; crop/pad as needed.

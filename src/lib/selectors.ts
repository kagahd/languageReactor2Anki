// Zentrale Sammlung aller Language-Reactor-DOM-Selektoren.
// LR-interne Klassen koennen sich bei Updates aendern - deshalb hier gebuendelt,
// damit Anpassungen an genau einer Stelle passieren. Dokumentiert in docs/lr-dom-map.md.

export const SEL = {
  // --- Untertitel unter dem Video (aktueller Satz) ---
  subtitleText: '.lln-subs-text',
  sentenceTranslation: '#lln-translations .lln-whole-title-translation .translationText',

  // --- Side-Panel / Woerterbuch ---
  dictWrap: '.lln-full-dict-wrap',
  dictWord: '.lln-dict-headword .lln-dict-word',
  dictTranslit: '.lln-dict-headword .lln-dict-translit',
  contextualTrans: '.lln-dict-contextual-trans',
  rankText: '.lln-dict-rank-text',
  sectionFull: '.lln-dict-section-full',

  // --- Bausteine innerhalb eines Wort-/Satz-Tokens ---
  word: '.lln-word',
  notWord: '.lln-not-word',
  translitInnerWrap: '.zh-translit-inner-wrap',
  translit: '.translit',
} as const;

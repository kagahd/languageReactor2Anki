// Datenmodell fuer eine aus Language Reactor extrahierte Vokabel-Karte.

export interface Meaning {
  /** Wortart, z.B. "noun", "adj." (ohne Klammern). Fehlt bei unmarkierten Zeilen. */
  pos?: string;
  /** Uebersetzung(en) dieser Bedeutung, z.B. "Anfaenger, Neuling, Einsteiger". */
  text: string;
}

export interface Sentence {
  hanzi: string;
  pinyin: string;
  translation: string;
}

export interface VideoSource {
  url: string;
  videoId?: string;
  /** Sekunde im Video zum Zeitpunkt der Extraktion. */
  time?: number;
}

export interface VocabCard {
  /** Das angeklickte Wort in Hanzi, z.B. "新手". */
  hanzi: string;
  /** Pinyin des Wortes, z.B. "xīn shǒu". */
  pinyin: string;
  /** Kontextbezogene Uebersetzung aus dem Panel-Kopf. */
  contextualTranslation: string;
  /** Vollstaendige Bedeutungsliste mit Wortarten. */
  meanings: Meaning[];
  /** Haeufigkeitsrang (LR-Premium-Info), falls vorhanden, z.B. "4997". */
  frequencyRank?: string;
  /** Aktueller Untertitelsatz (Hanzi/Pinyin/Uebersetzung), falls sichtbar. */
  sentence: Sentence | null;
  source: VideoSource;
  /** ISO-Zeitstempel der Extraktion. */
  capturedAt: string;
}

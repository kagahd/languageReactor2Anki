# Language Reactor DOM-Landkarte (Phase 1, validiert)

Ermittelt am echten Video `youtu.be/_4xh3FExUQM?t=971`, Chrome 156, Zielsprache DE.

**Grundlage:** kein Shadow-DOM (`shadowRoots=0`), kein relevantes iframe. Alle Inhalte
liegen direkt im Haupt-DOM mit semantischen `lln-*`-Klassen. Normale `querySelector`-Zugriffe
genügen. Das Content-Script braucht KEIN `all_frames`.

## 1. Untertitel unter dem Video (aktueller Satz)

Container: `#lln-bottom-panel` → `#lln-main-subs` → `#lln-subs-content` → `.lln-subs-wrap`

- Satzzeile: `#lln-subs.lln-sentence-wrap[data-index]`
- Wörter: `.lln-subs-text > span.lln-word[data-word-key="WORD|<HANZI>|zh-CN"]`
  - Hanzi pro Wort: `span.zh-translit-inner-wrap` (Text) ODER aus `data-word-key` (mittlerer Teil)
  - Pinyin pro Silbe: `span.translit` (z.B. `wǒ`, `shì`, `xīn`, `shǒu`)
- Satz-Übersetzung: `#lln-translations .lln-whole-title-translation .translationText`
  - Beispiel: « Ich bin ein Neuling. »

→ Satz-Hanzi = Konkatenation der `.zh-translit-inner-wrap`; Satz-Pinyin = Konkatenation der `.translit`.

## 2. Side-Panel / Wörterbuch (angeklicktes Wort)

Container: `.lln-full-dict-wrap` → `.lln-full-dict` → `.lln-dict-def`

### Kopf (das Wort selbst) - `.lln-dict-headword`
- Hanzi: `.lln-dict-word`            → « 新手 »
- Pinyin: `.lln-dict-translit`       → « xīn shǒu »   (sauberes Wort-Pinyin, besser als Konkatenation)
- Kontext-Übersetzung: `.lln-dict-contextual-trans` → « Neuling, Anfänger, Einsteiger »
- Frequenzrang: `.lln-dict-rank[title]` + `.lln-dict-rank-text` → « 4997 » (Premium-Info)

### Volle Definitionen mit Wortart - `.lln-dict-section-full`
Jede Bedeutungszeile = ein `div` mit zwei `span`:
- « (noun) »  « Anfänger, Neuling, Einsteiger »
- « (adj.) »  « unerfahren, neu »
- « (ANY) »   « Anfänger, Neuling, Einsteiger »
- « Beginner, Grünschnabel »

### Externe Wörterbuch-Links - `.lln-dict-external`
- `.lln-external-dict-btn[data-url][data-name]` (Glosbe, Wiktionary, bab.la, ChatGPT)
  - enthält das Wort in der URL, z.B. `data-url="https://glosbe.com/zh/de/新手"`

### Beispielsätze - `.lln-dict-section-examples`
Mehrere Blöcke `.lln-word-examples`, je mit `.lln-word-examples-title`:
- "Beispiele: Aktueller Text": ein `.lln-word-example[data-source="SUBS"][data-index]`
- "Beispiele: Tatoeba": mehrere `.lln-word-example[data-source="TATOEBA"][data-pos][data-index]`

Pro Beispiel:
- Hanzi-Tokens: `.lln-sub-text > span.lln-word[data-word-key]` (+ `span.lln-not-word` für Satzzeichen 。，)
- Zielwort hervorgehoben: `span.lln-word.lln-highlighted-word`
- Übersetzung: `span.tt` (Geschwister von `.lln-sub-text`), z.B. « Ich bin ein Neuling. »

## Offene Punkte / Risiken
- Pinyin der Tatoeba-Beispielsätze war im Dump nicht sichtbar (evtl. erst bei Hover gerendert
  oder durch Tiefenlimit abgeschnitten). Für die Karte ist der primäre Beispielsatz ohnehin
  der aktuelle Untertitel (Satz-Hanzi/Pinyin/Übersetzung vollständig vorhanden).
- Klassennamen sind LR-intern und können sich bei Updates ändern → Selektoren zentral kapseln,
  Fallbacks und defensives Parsen.
- `.lln-dict-contextual-trans` = kontextbezogene Bedeutung (ideal für die Kartenvorderseite);
  `.lln-dict-section-full` = vollständige Bedeutungsliste (ideal für die Rückseite).

/*
 * languageReactor2Anki - Extractor Probe (Verifikation Phase 0/1)
 *
 * Spiegelt 1:1 die Logik aus src/lib/extract.ts, aber als Konsolen-IIFE,
 * damit die Extraktion am echten LR-DOM getestet werden kann, OHNE die
 * Extension zu laden.
 *
 * Benutzung:
 *   1. Video offen, Wort angeklickt, Woerterbuch-Panel sichtbar.
 *   2. Dieses Skript in die Konsole einfuegen (ggf. vorher 'allow pasting').
 *   3. Es gibt die VocabCard aus und legt sie in window.lr2card ab.
 *   4. copy(JSON.stringify(lr2card, null, 2))  -> in die Zwischenablage.
 */
(() => {
  const SEL = {
    subtitleText: '.lln-subs-text',
    sentenceTranslation: '#lln-translations .lln-whole-title-translation .translationText',
    dictWrap: '.lln-full-dict-wrap',
    dictWord: '.lln-dict-headword .lln-dict-word',
    dictTranslit: '.lln-dict-headword .lln-dict-translit',
    contextualTrans: '.lln-dict-contextual-trans',
    rankText: '.lln-dict-rank-text',
    sectionFull: '.lln-dict-section-full',
    externalBtn: '.lln-dict-external .lln-external-dict-btn',
    wordExample: '.lln-dict-section-examples .lln-word-example',
    subText: '.lln-sub-text',
    word: '.lln-word',
    notWord: '.lln-not-word',
    translitInnerWrap: '.zh-translit-inner-wrap',
    translit: '.translit',
    exampleTooltip: '.tt',
  };

  const txt = (el) => (el && el.textContent ? el.textContent.replace(/\s+/g, ' ').trim() : '');

  function directText(el) {
    let s = '';
    el.childNodes.forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) s += n.textContent || '';
    });
    return s.replace(/\s+/g, '').trim();
  }

  function hanziFromKey(word) {
    const key = word.getAttribute('data-word-key');
    return key ? key.split('|')[1] || '' : '';
  }

  function readTokens(subText) {
    let hanzi = '';
    const pinyinParts = [];
    const tokens = subText.querySelectorAll(':scope > ' + SEL.word + ', :scope > ' + SEL.notWord);
    tokens.forEach((tok) => {
      if (tok.classList.contains('lln-not-word')) {
        hanzi += txt(tok);
        return;
      }
      const inners = tok.querySelectorAll(':scope > ' + SEL.translitInnerWrap);
      if (inners.length) {
        inners.forEach((w) => {
          hanzi += directText(w);
          const tr = w.querySelector(':scope > ' + SEL.translit);
          if (tr) pinyinParts.push(txt(tr));
        });
      } else {
        hanzi += hanziFromKey(tok) || txt(tok);
      }
    });
    return { hanzi, pinyin: pinyinParts.join(' ') };
  }

  function extractSentence(root) {
    const subText = root.querySelector(SEL.subtitleText);
    const translation = txt(root.querySelector(SEL.sentenceTranslation));
    if (!subText) return translation ? { hanzi: '', pinyin: '', translation } : null;
    const { hanzi, pinyin } = readTokens(subText);
    if (!hanzi && !translation) return null;
    return { hanzi, pinyin, translation };
  }

  function extractMeanings(dict) {
    const sec = dict.querySelector(SEL.sectionFull);
    if (!sec) return [];
    const out = [];
    sec.querySelectorAll('div').forEach((div) => {
      const spans = div.querySelectorAll(':scope > span');
      if (!spans.length) return;
      const first = txt(spans[0]);
      const m = first.match(/^\(([^)]*)\)$/);
      if (m && spans.length > 1) {
        const rest = Array.from(spans).slice(1).map(txt).filter(Boolean).join(' ');
        out.push({ pos: m[1], text: rest });
      } else {
        out.push({ text: Array.from(spans).map(txt).filter(Boolean).join(' ') });
      }
    });
    return out;
  }

  function extractExternalLinks(dict) {
    const out = [];
    dict.querySelectorAll(SEL.externalBtn).forEach((b) => {
      const url = b.getAttribute('data-url');
      if (!url) return;
      out.push({ name: b.getAttribute('data-name') || txt(b), url });
    });
    return out;
  }

  function extractExamples(dict) {
    const out = [];
    dict.querySelectorAll(SEL.wordExample).forEach((ex) => {
      const subText = ex.querySelector(SEL.subText);
      if (!subText) return;
      const { hanzi, pinyin } = readTokens(subText);
      if (!hanzi) return;
      const translation = txt(ex.querySelector(':scope > ' + SEL.exampleTooltip));
      out.push({
        source: ex.getAttribute('data-source') || '',
        hanzi,
        pinyin: pinyin || undefined,
        translation: translation || undefined,
      });
    });
    return out;
  }

  function extractVideoSource(doc) {
    const url = doc.location.href;
    let videoId;
    try { videoId = new URL(url).searchParams.get('v') || undefined; } catch (e) { videoId = undefined; }
    const video = doc.querySelector('video');
    const time = video && Number.isFinite(video.currentTime) ? Math.floor(video.currentTime) : undefined;
    return { url, videoId, time };
  }

  function extractVocabCard(doc) {
    const dict = doc.querySelector(SEL.dictWrap);
    if (!dict) return null;
    const hanzi = txt(dict.querySelector(SEL.dictWord));
    if (!hanzi) return null;
    return {
      hanzi,
      pinyin: txt(dict.querySelector(SEL.dictTranslit)),
      contextualTranslation: txt(dict.querySelector(SEL.contextualTrans)),
      meanings: extractMeanings(dict),
      frequencyRank: txt(dict.querySelector(SEL.rankText)) || undefined,
      sentence: extractSentence(doc),
      examples: extractExamples(dict),
      externalLinks: extractExternalLinks(dict),
      source: extractVideoSource(doc),
      capturedAt: new Date().toISOString(),
    };
  }

  const card = extractVocabCard(document);
  window.lr2card = card;
  if (!card) {
    console.warn('%c[lr2anki] Kein geoeffnetes LR-Woerterbuch-Panel gefunden. Erst ein Wort anklicken.', 'color:#e53935;font-weight:bold');
  } else {
    console.log('%c[lr2anki] VocabCard extrahiert:', 'color:#4caf50;font-weight:bold', card);
    console.log('%c[lr2anki] Zum Teilen:  copy(JSON.stringify(lr2card, null, 2))', 'color:#4caf50;font-weight:bold');
  }
  return card;
})();

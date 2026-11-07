/*
 * languageReactor2Anki - DOM Inspector (Phase 1)
 *
 * Zweck: Herausfinden, ob und wie sich die von Language Reactor (LR) angezeigten
 * Daten (Hanzi, Pinyin, Uebersetzung, Beispiele) aus dem DOM auslesen lassen.
 *
 * Benutzung:
 *   1. Video oeffnen:  https://youtu.be/_4xh3FExUQM?t=971
 *   2. LR-Untertitel aktiv lassen, das Wort anklicken (Side-Panel oeffnet sich).
 *   3. DevTools -> Konsole oeffnen, DIESES GANZE SKRIPT einfuegen, Enter.
 *   4. Mit ALT+Klick (Windows/Linux) bzw. OPTION+Klick (Mac) nacheinander:
 *        - den Kopf-Eintrag im Side-Panel (das grosse Hanzi, z.B. 新手)
 *        - das Pinyin / die Uebersetzung im Panel
 *        - einen Beispielsatz im Panel
 *        - die Untertitelzeile UNTER dem Video (Hanzi/Pinyin/Uebersetzung)
 *      Jeder ALT/OPTION+Klick haengt einen Report an einen Puffer an.
 *   5. lr2copy()  -> kopiert den gesamten Report in die Zwischenablage.
 *      (oder lr2print() -> gibt ihn in der Konsole aus)
 *   6. Report an Claude zurueckgeben.
 *
 * Der ALT/OPTION+Klick wird abgefangen (preventDefault), stoert LR also nicht.
 * Zum Deaktivieren: lr2off()
 */
(() => {
  const MAX_DEPTH = 5;
  const MAX_TEXT = 80;
  const buffer = [];

  const tag = () => '%c[lr2anki]';
  const style = 'color:#4caf50;font-weight:bold';

  function describe(node) {
    if (node === window) return 'window';
    if (node instanceof Document) return '#document';
    if (typeof ShadowRoot !== 'undefined' && node instanceof ShadowRoot) {
      return '#shadow-root(' + (node.mode || '?') + ')';
    }
    if (!node || !node.tagName) return String(node && node.nodeName);
    let s = node.tagName.toLowerCase();
    if (node.id) s += '#' + node.id;
    if (node.classList && node.classList.length) {
      s += '.' + Array.from(node.classList).join('.');
    }
    for (const a of (node.attributes || [])) {
      if (a.name.startsWith('data-') || ['role', 'aria-label', 'title', 'lang'].includes(a.name)) {
        s += '[' + a.name + '="' + (a.value || '').slice(0, 40) + '"]';
      }
    }
    return s;
  }

  function ownText(el) {
    let t = '';
    for (const n of el.childNodes) if (n.nodeType === 3) t += n.textContent;
    return t.trim().replace(/\s+/g, ' ').slice(0, MAX_TEXT);
  }

  function outline(el, depth, out, maxDepth) {
    const md = (maxDepth == null) ? MAX_DEPTH : maxDepth;
    if (!el || !el.tagName || depth > md) return;
    const ind = '  '.repeat(depth);
    const ot = ownText(el);
    out.push(ind + describe(el) + (ot ? '  « ' + ot + ' »' : ''));
    for (const c of el.children) outline(c, depth + 1, out, md);
  }

  // Deepest-containing: Elemente, deren Text die Zeichenkette enthaelt,
  // aber kein Kind-Element sie allein enthaelt (also die engsten Wrapper).
  function findDeepest(text) {
    const hits = [];
    const all = document.querySelectorAll('body *');
    for (const el of all) {
      const t = el.textContent || '';
      if (!t.includes(text)) continue;
      let childHas = false;
      for (const c of el.children) {
        if ((c.textContent || '').includes(text)) { childHas = true; break; }
      }
      if (!childHas) hits.push(el);
    }
    return hits;
  }

  // Umgebungs-Scan: Shadow-DOM / iframes? (beantwortet die Machbarkeitsfrage)
  function scanEnv() {
    let shadow = 0, iframeSame = 0, iframeCross = 0;
    const seen = new Set();
    const walk = (root) => {
      if (!root || seen.has(root)) return;
      seen.add(root);
      let els;
      try { els = root.querySelectorAll('*'); } catch (e) { return; }
      els.forEach((el) => {
        if (el.shadowRoot) { shadow++; walk(el.shadowRoot); }
        if (el.tagName === 'IFRAME') {
          try {
            if (el.contentDocument) { iframeSame++; walk(el.contentDocument); }
            else iframeCross++;
          } catch (e) { iframeCross++; }
        }
      });
    };
    walk(document);
    return { shadow, iframeSame, iframeCross };
  }

  function dumpTarget(path) {
    const out = [];
    const elements = path.filter((n) => n && n.tagName);
    out.push('--------------------------------------------------');
    out.push('CLICK #' + (buffer.length + 1));
    out.push('');
    out.push('ANCESTRY (target -> oben, quert Shadow-DOM-Grenzen):');
    path.forEach((n, i) => {
      if (n === window || n instanceof Document) return;
      out.push('  [' + i + '] ' + describe(n));
    });
    out.push('');
    // lokalen Teilbaum ab einem Vorfahren ~3 Ebenen hoeher ausgeben
    const anchor = elements[Math.min(3, elements.length - 1)] || elements[0];
    out.push('SUBTREE ab ' + describe(anchor) + ':');
    const sub = [];
    outline(anchor, 0, sub);
    out.push.apply(out, sub.map((l) => '  ' + l));
    out.push('');
    return out.join('\n');
  }

  const isMod = (e) => (e.ctrlKey || e.metaKey) && !e.altKey;

  function onClick(e) {
    if (!isMod(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const path = e.composedPath ? e.composedPath() : [];
    const report = dumpTarget(path);
    buffer.push(report);
    console.log(tag() + ' erfasst (#' + buffer.length + '). Weiter klicken oder lr2copy() aufrufen.', style);
    console.log(report);
  }

  document.addEventListener('click', onClick, true);
  document.addEventListener('mousedown', (e) => { if (isMod(e)) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);

  // Textsuche (kein Klick noetig): Panel offen lassen, dann z.B. lr2find('Neuling')
  window.lr2find = function (text, up, depth) {
    up = (up == null) ? 8 : up;
    depth = (depth == null) ? 9 : depth;
    const hits = findDeepest(text);
    const out = [];
    out.push('==================================================');
    out.push('FIND "' + text + '"  -> ' + hits.length + ' Treffer');
    hits.slice(0, 6).forEach((hit, idx) => {
      out.push('');
      out.push('TREFFER ' + (idx + 1) + ':  ' + describe(hit));
      const anc = [];
      let n = hit.parentElement, steps = 0;
      while (n && steps < 5) { anc.push('    ^ ' + describe(n)); n = n.parentElement; steps++; }
      out.push.apply(out, anc);
    });
    if (hits.length) {
      let container = hits[0];
      for (let i = 0; i < up && container.parentElement; i++) container = container.parentElement;
      out.push('');
      out.push('SUBTREE ab ' + describe(container) + ' (Container von Treffer 1):');
      const sub = [];
      outline(container, 0, sub, depth);
      out.push.apply(out, sub.map((l) => '  ' + l));
    }
    out.push('');
    buffer.push(out.join('\n'));
    console.log(tag() + ' lr2find("' + text + '") fertig, ' + hits.length + ' Treffer. Weitere lr2find(...) oder: lr2copy() dann copy(lr2text)', style);
    return hits.length;
  };

  const env = scanEnv();
  const header =
    'LANGUAGE REACTOR DOM REPORT\n' +
    'URL: ' + location.href + '\n' +
    'UserAgent: ' + navigator.userAgent + '\n' +
    'Umgebung: shadowRoots=' + env.shadow +
    ', iframes(same-origin)=' + env.iframeSame +
    ', iframes(cross-origin)=' + env.iframeCross + '\n';

  window.lr2copy = function () {
    const text = header + '\n' + buffer.join('\n');
    window.lr2text = text;
    console.log(tag() + ' Report liegt jetzt in der Variable lr2text (' + buffer.length + ' Klicks).', style);
    console.log(tag() + ' Fuehre nun aus:  copy(lr2text)   -> das kopiert ihn zuverlaessig in die Zwischenablage.', style);
    // Best-effort zusaetzlich die JS-Clipboard-API versuchen (klappt nur bei Seitenfokus):
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    return text;
  };
  window.lr2print = function () { console.log(header + '\n' + buffer.join('\n')); };
  window.lr2off = function () {
    document.removeEventListener('click', onClick, true);
    console.log(tag() + ' Inspektor deaktiviert.', style);
  };

  console.log(tag() + ' aktiv. ' + header.replace(/\n/g, ' | '), style);
  console.log(tag() + ' Panel offen lassen, dann z.B.:  lr2find("Neuling")  lr2find("unerfahren")  lr2find("Tatoeba")', style);
  console.log(tag() + ' Alternativ CTRL+Klick bzw. CMD+Klick auf ein Element. Am Ende: lr2copy() dann copy(lr2text)', style);
})();

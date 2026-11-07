// Leichtgewichtige UI-Bausteine fuer das Content-Script: ein "Anki"-Button im
// LR-Panel und kleine Toasts. Bewusst ohne Framework, Styles sind lr2a-praefixiert.

const STYLE_ID = 'lr2a-style';
const BTN_CLASS = 'lr2a-btn';

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .${BTN_CLASS} {
      display: inline-flex; align-items: center; gap: 4px;
      margin: 6px 0; padding: 4px 12px;
      font-size: 13px; font-weight: 600; line-height: 1.4;
      color: #fff; background: #2a7f62; border: none; border-radius: 14px;
      cursor: pointer; transition: background .15s;
    }
    .${BTN_CLASS}:hover { background: #246e55; }
    .${BTN_CLASS}:disabled { opacity: .6; cursor: default; }
    .${BTN_CLASS}.lr2a-ok { background: #2e7d32; }
    .${BTN_CLASS}.lr2a-err { background: #c62828; }

    .lr2a-toast {
      position: fixed; z-index: 2147483647; right: 18px; bottom: 18px;
      max-width: 340px; padding: 10px 14px; border-radius: 8px;
      font: 13px/1.4 -apple-system, sans-serif; color: #fff;
      box-shadow: 0 4px 16px rgba(0,0,0,.3);
      opacity: 0; transform: translateY(8px); transition: opacity .2s, transform .2s;
    }
    .lr2a-toast.lr2a-show { opacity: 1; transform: translateY(0); }
    .lr2a-toast.lr2a-ok { background: #2e7d32; }
    .lr2a-toast.lr2a-err { background: #c62828; }
  `;
  document.head.appendChild(style);
}

export function toast(message: string, kind: 'ok' | 'err'): void {
  ensureStyle();
  const el = document.createElement('div');
  el.className = `lr2a-toast lr2a-${kind}`;
  el.textContent = message;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('lr2a-show'));
  setTimeout(() => {
    el.classList.remove('lr2a-show');
    setTimeout(() => el.remove(), 250);
  }, 3200);
}

function isVisible(el: Element): boolean {
  const e = el as HTMLElement & { checkVisibility?: () => boolean };
  if (typeof e.checkVisibility === 'function') return e.checkVisibility();
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/**
 * Stellt sicher, dass der Anki-Button genau dann im LR-Panel vorhanden ist,
 * wenn ein sichtbares Woerterbuch-Panel mit echtem Wort offen ist. Sonst wird
 * ein evtl. vorhandener Button entfernt. Idempotent (bei jeder DOM-Mutation aufrufbar).
 */
export function ensureAnkiButton(onClick: (btn: HTMLButtonElement) => void): void {
  // Passendes, SICHTBARES Panel mit echtem Headword suchen (es kann mehrere
  // .lln-full-dict-wrap im DOM geben, auch versteckte/verwaiste).
  let anchor: Element | null = null;
  for (const wrap of document.querySelectorAll('.lln-full-dict-wrap')) {
    const headword = wrap.querySelector('.lln-dict-headword .lln-dict-word');
    const contextual = wrap.querySelector('.lln-dict-contextual');
    if (headword && headword.textContent?.trim() && contextual && isVisible(wrap)) {
      anchor = contextual;
      break;
    }
  }

  const existing = document.querySelector(`.${BTN_CLASS}`);
  if (!anchor) {
    existing?.remove(); // kein passendes Panel -> keinen Geister-Button stehen lassen
    return;
  }
  if (anchor.contains(existing)) return; // schon am richtigen Platz
  existing?.remove(); // evtl. am falschen Ort -> neu setzen

  ensureStyle();
  const btn = document.createElement('button');
  btn.className = BTN_CLASS;
  btn.textContent = '➕ Anki';
  btn.addEventListener(
    'click',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick(btn);
    },
    true,
  );
  anchor.appendChild(btn);
}

export function setButtonState(
  btn: HTMLButtonElement,
  state: 'idle' | 'busy' | 'ok' | 'err',
): void {
  btn.classList.remove('lr2a-ok', 'lr2a-err');
  switch (state) {
    case 'busy':
      btn.disabled = true;
      btn.textContent = '… Anki';
      break;
    case 'ok':
      btn.disabled = false;
      btn.classList.add('lr2a-ok');
      btn.textContent = '✓ Anki';
      break;
    case 'err':
      btn.disabled = false;
      btn.classList.add('lr2a-err');
      btn.textContent = '⚠ Anki';
      break;
    default:
      btn.disabled = false;
      btn.textContent = '➕ Anki';
  }
}

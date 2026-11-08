import { browser } from 'wxt/browser';
import { extractVocabCard, validateVocabCard } from '../lib/extract';
import { ensureAnkiButton, setButtonState, toast } from '../lib/ui';
import type { AddCardResponse, PingResponse } from '../lib/messages';

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  runAt: 'document_idle',
  main(ctx) {
    const RELOAD_HINT =
      'languageReactor2Anki was updated. Click "↻ Reload page" (or refresh the tab) to continue.';

    let invalidated = false;
    let notified = false;

    // After an extension reload/update, open tabs keep running an orphaned content
    // script that can no longer reach the extension. Instead of a cryptic error,
    // turn the button into a clear "reload" action and tell the user once.
    function flipButtonToReload(): void {
      const b = document.querySelector('.lr2a-btn');
      if (b instanceof HTMLButtonElement) {
        setButtonState(b, 'err');
        b.textContent = '↻ Reload page';
      }
    }

    function handleInvalidated(): void {
      invalidated = true;
      flipButtonToReload();
      if (!notified) {
        notified = true;
        toast(RELOAD_HINT, 'err');
      }
    }

    const RESUME_KEY = 'lr2a:resumeAt';

    function mainVideo(): HTMLVideoElement | null {
      return (
        document.querySelector<HTMLVideoElement>('video.html5-main-video') ??
        document.querySelector<HTMLVideoElement>('video')
      );
    }

    // Reload the page and resume the video exactly where it was. YouTube's own
    // resume lags ~10-20s and overrides a URL "t" param, so we store the time and
    // seek the video ourselves after the reload.
    function reloadAtTimestamp(): void {
      try {
        const v = mainVideo();
        const t = v && Number.isFinite(v.currentTime) ? v.currentTime : 0;
        if (t > 0) sessionStorage.setItem(RESUME_KEY, JSON.stringify({ t, ts: Date.now() }));
      } catch {
        /* ignore; fall back to a plain reload */
      }
      location.reload();
    }

    // After a reload triggered by reloadAtTimestamp(), seek back to the stored time.
    // Enforced briefly because YouTube may first jump to its own (lagging) position.
    function resumeIfPending(): void {
      let raw: string | null = null;
      try {
        raw = sessionStorage.getItem(RESUME_KEY);
        if (raw) sessionStorage.removeItem(RESUME_KEY);
      } catch {
        return;
      }
      if (!raw) return;
      let target = 0;
      let ts = 0;
      try {
        const d = JSON.parse(raw) as { t?: number; ts?: number };
        target = Number(d.t);
        ts = Number(d.ts);
      } catch {
        return;
      }
      if (!Number.isFinite(target) || target <= 0 || Date.now() - ts > 60_000) return;
      let tries = 0;
      const iv = setInterval(() => {
        tries += 1;
        const v = mainVideo();
        if (v && Number.isFinite(v.duration) && v.duration > 0 && Math.abs(v.currentTime - target) > 1.5) {
          v.currentTime = target;
        }
        if (tries >= 20) clearInterval(iv);
      }, 300);
    }
    resumeIfPending();

    // WXT fires this when the extension context is invalidated (reload/update).
    ctx.onInvalidated(() => handleInvalidated());

    async function onAddClick(btn: HTMLButtonElement): Promise<void> {
      if (invalidated) {
        reloadAtTimestamp();
        return;
      }
      if (!ctx.isValid) {
        handleInvalidated();
        return;
      }

      const card = extractVocabCard(document);
      if (!card) {
        toast('No open Language Reactor dictionary panel found.', 'err');
        return;
      }
      // Guard against LR updates: do not create a card from an incomplete extraction.
      const issues = validateVocabCard(card);
      if (issues.critical.length > 0) {
        setButtonState(btn, 'err');
        toast(
          `Extraction incomplete (${issues.critical.join(', ')} missing). Possibly a Language Reactor update - check selectors. Card not created.`,
          'err',
        );
        setTimeout(() => setButtonState(btn, 'idle'), 3000);
        return;
      }
      if (issues.warnings.length > 0) {
        console.warn('[lr2anki] Incomplete fields:', issues.warnings.join(', '));
      }

      setButtonState(btn, 'busy');
      try {
        const res = (await browser.runtime.sendMessage({
          type: 'ADD_CARD',
          card,
        })) as AddCardResponse;
        if (res.ok && 'duplicate' in res) {
          setButtonState(btn, 'ok');
          toast(`Already in Anki (identical): ${card.hanzi}`, 'ok');
        } else if (res.ok) {
          setButtonState(btn, 'ok');
          toast(`Saved to Anki: ${card.hanzi} (${card.pinyin})`, 'ok');
        } else {
          setButtonState(btn, 'err');
          toast(`Anki error: ${res.error}`, 'err');
        }
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        if (/context invalidated|Receiving end does not exist|message port closed/i.test(m)) {
          handleInvalidated();
        } else {
          setButtonState(btn, 'err');
          toast(`Error: ${m}`, 'err');
        }
      }
      if (!invalidated) setTimeout(() => setButtonState(btn, 'idle'), 2500);
    }

    // Inject the button when LR's panel appears/changes; keep it in reload state
    // if the context is already invalidated.
    let scheduled = false;
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        ensureAnkiButton(onAddClick);
        if (invalidated) flipButtonToReload();
      });
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    schedule();

    // Debug helpers (visible in the content-script context of DevTools).
    Object.assign(window as unknown as Record<string, unknown>, {
      lr2extract: () => extractVocabCard(document),
      lr2ping: async () =>
        (await browser.runtime.sendMessage({ type: 'PING' })) as PingResponse,
    });

    console.log('[lr2anki] content script active - Anki button will be injected into the LR panel.');
  },
});

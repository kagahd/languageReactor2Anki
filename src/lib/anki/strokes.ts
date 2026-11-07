import { browser } from 'wxt/browser';
import { ankiInvoke } from './connect';

// HanziWriter-Library und Zeichendaten (Make Me a Hanzi) via jsDelivr-CDN.
export const HANZI_WRITER_VERSION = '3.7.3';
export const HANZI_WRITER_FILENAME = '_hanzi-writer.min.js';
const HANZI_WRITER_URL = `https://cdn.jsdelivr.net/npm/hanzi-writer@${HANZI_WRITER_VERSION}/dist/hanzi-writer.min.js`;
const CHAR_DATA_URL = (char: string) =>
  `https://cdn.jsdelivr.net/npm/hanzi-writer-data@2/${encodeURIComponent(char)}.json`;
const CACHE_PREFIX = 'hw:';

/** CJK-Ideogramme (vereinfacht/traditionell, inkl. Ext A). */
function isCjk(ch: string): boolean {
  return /[㐀-鿿]/.test(ch);
}

/**
 * Stellt sicher, dass die HanziWriter-Library als Mediendatei in Anki liegt.
 * Der Unterstrich-Praefix schuetzt sie vor Ankis "ungenutzte Medien"-Loeschung.
 * Anki laedt die URL selbst herunter (kein Browser-CORS noetig).
 */
export async function ensureLibraryMedia(baseUrl: string): Promise<void> {
  const existing = await ankiInvoke<string | false>(
    'retrieveMediaFile',
    { filename: HANZI_WRITER_FILENAME },
    baseUrl,
  );
  if (existing) return;
  await ankiInvoke(
    'storeMediaFile',
    { filename: HANZI_WRITER_FILENAME, url: HANZI_WRITER_URL },
    baseUrl,
  );
}

/**
 * Laedt die Strichdaten fuer alle CJK-Zeichen eines Wortes und gibt eine
 * Map char -> HanziWriter-Daten zurueck. Einzelne Fehlschlaege werden
 * uebersprungen (seltene Zeichen fehlen evtl. im Datensatz).
 */
export async function fetchStrokeData(hanzi: string): Promise<Record<string, unknown>> {
  const chars = Array.from(new Set(Array.from(hanzi))).filter(isCjk);
  if (chars.length === 0) return {};

  const map: Record<string, unknown> = {};

  // Zuerst aus dem lokalen Cache bedienen (jedes Zeichen wird so hoechstens
  // einmal ueberhaupt aus dem Netz geladen).
  const keys = chars.map((c) => CACHE_PREFIX + c);
  let cached: Record<string, unknown> = {};
  try {
    cached = await browser.storage.local.get(keys);
  } catch {
    /* ohne Cache weiter */
  }

  const missing: string[] = [];
  for (const c of chars) {
    const v = cached[CACHE_PREFIX + c];
    if (v !== undefined) map[c] = v;
    else missing.push(c);
  }

  if (missing.length > 0) {
    const toStore: Record<string, unknown> = {};
    await Promise.all(
      missing.map(async (c) => {
        try {
          const res = await fetch(CHAR_DATA_URL(c));
          if (res.ok) {
            const data = await res.json();
            map[c] = data;
            toStore[CACHE_PREFIX + c] = data;
          }
        } catch {
          /* Zeichen ohne Daten einfach auslassen */
        }
      }),
    );
    if (Object.keys(toStore).length > 0) {
      try {
        await browser.storage.local.set(toStore);
      } catch {
        /* Cache-Schreiben ist optional */
      }
    }
  }

  return map;
}

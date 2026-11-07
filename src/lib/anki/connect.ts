// Minimaler AnkiConnect-Client. Laeuft im Background-Service-Worker, damit die
// Requests die Herkunft chrome-extension://<id> tragen (CORS-Whitelist in AnkiConnect).

interface AnkiResponse<T> {
  result: T;
  error: string | null;
}

export class AnkiConnectError extends Error {}

export async function ankiInvoke<T = unknown>(
  action: string,
  params: Record<string, unknown>,
  baseUrl: string,
  version = 6,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, version, params }),
    });
  } catch {
    throw new AnkiConnectError(
      `Cannot reach Anki at ${baseUrl}. Is Anki Desktop running with the AnkiConnect add-on?`,
    );
  }
  if (!res.ok) {
    throw new AnkiConnectError(`AnkiConnect responded with HTTP ${res.status}.`);
  }
  const data = (await res.json()) as AnkiResponse<T>;
  if (data.error) {
    throw new AnkiConnectError(data.error);
  }
  return data.result;
}

/** Testet die Verbindung und gibt die AnkiConnect-Version zurueck. */
export function ankiVersion(baseUrl: string): Promise<number> {
  return ankiInvoke<number>('version', {}, baseUrl);
}

/** Legt ein Deck an (idempotent). */
export function ensureDeck(deckName: string, baseUrl: string): Promise<number> {
  return ankiInvoke<number>('createDeck', { deck: deckName }, baseUrl);
}

/**
 * Fordert die Zugriffserlaubnis an. Bei einer neuen Herkunft zeigt Anki einen
 * Bestaetigungsdialog; danach ist die Herkunft dauerhaft erlaubt.
 */
export async function ankiRequestPermission(baseUrl: string): Promise<void> {
  const res = await ankiInvoke<{ permission: string }>('requestPermission', {}, baseUrl);
  if (res.permission !== 'granted') {
    throw new AnkiConnectError(
      "AnkiConnect denied access. Please confirm the dialog in Anki, or add the extension origin to AnkiConnect's config (webCorsOriginList).",
    );
  }
}

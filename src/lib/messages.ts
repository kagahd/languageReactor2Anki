import type { VocabCard } from './types';

export type Message =
  | { type: 'ADD_CARD'; card: VocabCard }
  | { type: 'PING' }
  | { type: 'SYNC_MODEL' };

export type AddCardResponse =
  | { ok: true; noteId: number }
  | { ok: true; duplicate: true }
  | { ok: false; error: string };

export type PingResponse =
  | { ok: true; version: number }
  | { ok: false; error: string };

export type SyncModelResponse =
  | { ok: true }
  | { ok: false; error: string };

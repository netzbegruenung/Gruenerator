/**
 * In-process collector for article-level content-sync events.
 *
 * Scrapers call `recordSyncEvent` at their store/update success seam; the sync
 * entry points drain the buffer afterwards — update-all-content.ts POSTs the
 * events to /api/internal/monitor/sync-events (CI has no Postgres access),
 * while the in-process content-sync router persists them directly. Draining is
 * mandatory: in the long-lived API process an undrained buffer would grow
 * across runs (the cap below is only a safety net, not the contract).
 */
import { type SyncEventInput } from '@gruenerator/contracts';

const MAX_BUFFERED_EVENTS = 5000;
const EXCERPT_MAX_CHARS = 300;

let events: SyncEventInput[] = [];

/**
 * Leading structural marker on a line: a markdown heading (`## `), a list
 * bullet (`- `), or an enumerator (`1. ` / `1) `) — see `htmlToStructuredText`
 * (`utils/htmlCleaner.ts`), which now emits these into `full_text`.
 */
const LINE_MARKER = /^\s*(?:#{1,6}[ \t]+|-[ \t]+|\d+[.)][ \t]+)/;

/** Normalize article text into a short single-line excerpt for the feed cards. */
export function toExcerpt(text: string | null | undefined): string | null {
  if (!text) return null;
  const stripped = text
    .split('\n')
    .map((line) => line.replace(LINE_MARKER, ''))
    .join(' ');
  const cleaned = stripped.replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.length > EXCERPT_MAX_CHARS ? `${cleaned.slice(0, EXCERPT_MAX_CHARS)}…` : cleaned;
}

export function recordSyncEvent(event: Omit<SyncEventInput, 'indexedAt'>): void {
  if (events.length >= MAX_BUFFERED_EVENTS) return;
  events.push({ ...event, indexedAt: new Date().toISOString() });
}

/** Returns all buffered events and clears the buffer. */
export function drainSyncEvents(): SyncEventInput[] {
  const drained = events;
  events = [];
  return drained;
}

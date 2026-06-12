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

let events: SyncEventInput[] = [];

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

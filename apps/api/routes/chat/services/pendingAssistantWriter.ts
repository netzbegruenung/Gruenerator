/**
 * Pending-assistant writer: accumulates the streaming reply in memory and
 * periodically flushes it to the placeholder chat_messages row (turn-persistence
 * WP-B). Kept pure + injectable so the flush target can be stubbed in tests.
 *
 * Guarantees:
 *  - at most one flush UPDATE in flight at a time (serialized — never two
 *    parallel writes racing on the same row);
 *  - a flush failure is logged + swallowed, so a Postgres hiccup can never
 *    disturb the user-facing SSE stream;
 *  - `stop()` awaits any in-flight flush and, if still dirty, flushes once more
 *    so the final throttle write isn't lost.
 */

import { createLogger } from '../../../utils/logger.js';

import { updatePendingAssistantText } from './threadPersistenceService.js';

const log = createLogger('pendingAssistantWriter');

export interface PendingAssistantWriter {
  readonly messageId: string;
  /** `delta` appends; `completion` REPLACES the buffer (the citation-clamp
   *  corrected full text arrives as a completion). */
  onText(kind: 'delta' | 'completion', text: string): void;
  stop(): Promise<void>;
}

export function createPendingAssistantWriter(
  messageId: string,
  intervalMs = 2500,
  updateFn: (messageId: string, text: string) => Promise<void> = updatePendingAssistantText
): PendingAssistantWriter {
  let buffer = '';
  let dirty = false;
  let stopped = false;
  let inFlight: Promise<void> | null = null;

  const flush = async (): Promise<void> => {
    // Serialize: if a flush is already running, wait for it — the dirty flag
    // ensures the newest buffer gets written by a subsequent flush.
    if (inFlight) {
      await inFlight;
      return;
    }
    if (!dirty) return;
    dirty = false;
    const snapshot = buffer;
    inFlight = (async () => {
      try {
        await updateFn(messageId, snapshot);
      } catch (err) {
        // Persistence outage must never surface to the stream — log + swallow.
        log.warn(`[pendingAssistantWriter] flush failed for ${messageId}:`, err);
      }
    })();
    try {
      await inFlight;
    } finally {
      inFlight = null;
    }
  };

  const timer = setInterval(() => {
    void flush();
  }, intervalMs);
  // Don't keep the event loop alive for this best-effort throttle.
  timer.unref?.();

  return {
    messageId,
    onText(kind, text) {
      if (stopped) return;
      if (kind === 'completion') {
        buffer = text;
      } else {
        buffer += text;
      }
      dirty = true;
    },
    async stop() {
      stopped = true;
      clearInterval(timer);
      // Await any in-flight write, then flush once more if the buffer moved on.
      if (inFlight) await inFlight;
      if (dirty) await flush();
    },
  };
}

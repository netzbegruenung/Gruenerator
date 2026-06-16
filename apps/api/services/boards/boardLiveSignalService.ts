/**
 * Live-comment signalling over the Hocuspocus internal API.
 *
 * Board comments live relationally in Postgres (React Query is the client-side
 * source of truth), so they are not part of the board's Yjs doc. To make them
 * appear live — for human collaborators and for the async agent worker alike —
 * we bump a tiny per-card counter in the board ydoc via the same server→ydoc
 * bridge the canvas chat editing uses (see canvasStateService). Connected board
 * clients observe the bump and invalidate their comment query.
 *
 * Fire-and-forget: a Hocuspocus outage must never break a comment write, so
 * every failure is swallowed (liveness degrades to manual refresh).
 */
import { createLogger } from '../../utils/logger.js';

const log = createLogger('boardLiveSignalService');

const INTERNAL_URL = process.env.HOCUSPOCUS_INTERNAL_URL || 'http://localhost:1241';
const INTERNAL_TOKEN = process.env.HOCUSPOCUS_INTERNAL_TOKEN || '';
const FETCH_TIMEOUT_MS = 5000;

/**
 * Notify connected board clients that a card's comment thread changed. Safe to
 * call without awaiting; never throws.
 */
export async function bumpCardComments(boardId: string, cardId: string): Promise<void> {
  if (!INTERNAL_TOKEN) return; // internal API disabled — nothing to signal
  try {
    const res = await fetch(
      `${INTERNAL_URL}/internal/board/${encodeURIComponent(boardId)}/comment-bump`,
      {
        method: 'POST',
        headers: {
          'x-internal-token': INTERNAL_TOKEN,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ cardId }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }
    );
    if (!res.ok) {
      log.warn(`comment-bump for board ${boardId} card ${cardId} returned ${res.status}`);
    }
  } catch (err) {
    log.warn(
      `comment-bump for board ${boardId} card ${cardId} failed: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}

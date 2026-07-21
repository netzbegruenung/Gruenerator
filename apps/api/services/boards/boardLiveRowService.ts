/**
 * Server-side creation of new board cards (rows) that appear LIVE for connected
 * clients.
 *
 * Cards live in the board's Yjs doc. A raw `yjs_document_updates` upsert
 * (`addRowsToBoard`) is invisible to a live-connected Hocuspocus session until
 * reload — and could clobber in-flight edits. So the primary path posts to the
 * Hocuspocus internal API, which appends the rows inside the LIVE doc via
 * `openDirectConnection` + `transact` (CRDT-safe, immediately visible) — the same
 * bridge `boardLiveSignalService` uses for comment bumps.
 *
 * Fallback (no internal token / Hocuspocus unreachable): the raw DB upsert, so
 * cards still get created and appear on the next board load. That fallback only
 * runs when there is no live session to diverge from, so it is safe.
 */
import { createLogger } from '../../utils/logger.js';

import { addRowsToBoard } from './BoardService.js';

const log = createLogger('boardLiveRowService');

const INTERNAL_URL = process.env.HOCUSPOCUS_INTERNAL_URL || 'http://localhost:1241';
const INTERNAL_TOKEN = process.env.HOCUSPOCUS_INTERNAL_TOKEN || '';
const FETCH_TIMEOUT_MS = 5000;

export interface NewCardRow {
  title: string;
  status?: string;
  description?: string;
  dueDate?: string | null;
}

/**
 * Append cards to a board. Returns true if they were written into the live doc
 * (visible without reload), false if they fell back to the DB upsert.
 */
export async function addRowsToBoardLive(
  boardId: string,
  rows: NewCardRow[],
  userId: string
): Promise<boolean> {
  if (rows.length === 0) return false;

  if (INTERNAL_TOKEN) {
    try {
      const res = await fetch(
        `${INTERNAL_URL}/internal/board/${encodeURIComponent(boardId)}/rows`,
        {
          method: 'POST',
          headers: {
            'x-internal-token': INTERNAL_TOKEN,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ rows, userId }),
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        }
      );
      if (res.ok) return true;
      log.warn(`live rows for board ${boardId} returned ${res.status} — falling back to DB upsert`);
    } catch (err) {
      log.warn(
        `live rows for board ${boardId} failed: ${
          err instanceof Error ? err.message : String(err)
        } — falling back to DB upsert`
      );
    }
  }

  // Fallback: raw DB upsert (appears on next board load). addRowsToBoard reads
  // the same title/status/description/dueDate keys off each row.
  await addRowsToBoard(boardId, rows as unknown as Array<Record<string, unknown>>, userId);
  return false;
}

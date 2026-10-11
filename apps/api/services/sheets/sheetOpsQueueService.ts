/**
 * Chat edits for a sheet, parked in the sheet's own Y.Doc
 * (`SHEET_YDOC_KEYS.pendingOps`) via the Hocuspocus internal API.
 *
 * The API ships without Univer, and only a live Univer instance computes
 * styles and formulas correctly — so the server never executes sheet ops. It
 * used to stream them to the browser instead, where they were dropped whenever
 * the sheet was not open (#4457). Queued in the doc, they reach whichever
 * editor opens it next, or the open one within a second.
 *
 * No DB fallback: a queue entry written beside Yjs would never be read. When
 * Hocuspocus is unreachable the write fails and the chat answer says so.
 */
import { createLogger } from '../../utils/logger.js';

import type { PendingSheetOps } from '@gruenerator/contracts';

const log = createLogger('sheetOpsQueue');

const INTERNAL_URL = process.env.HOCUSPOCUS_INTERNAL_URL || 'http://localhost:1241';
const INTERNAL_TOKEN = process.env.HOCUSPOCUS_INTERNAL_TOKEN || '';
const FETCH_TIMEOUT_MS = 5000;

async function internalPost(path: string, body: unknown): Promise<unknown> {
  if (!INTERNAL_TOKEN) throw new Error('HOCUSPOCUS_INTERNAL_TOKEN not configured');
  const res = await fetch(`${INTERNAL_URL}${path}`, {
    method: 'POST',
    headers: { 'x-internal-token': INTERNAL_TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`internal POST ${path} returned ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

export interface QueuedSheetOps {
  /** An editor is connected now and applies the batch right away. */
  live: boolean;
}

/** Throws when the batch could not be queued — callers must not report success. */
export async function queueSheetOps(
  sheetId: string,
  operations: unknown[],
  summary: string
): Promise<QueuedSheetOps> {
  const body = (await internalPost(`/internal/sheet/${encodeURIComponent(sheetId)}/ops`, {
    operations,
    summary,
  })) as { live?: unknown };
  log.info(`queued ${operations.length} op(s) on ${sheetId} (live=${body.live === true})`);
  return { live: body.live === true };
}

export async function claimSheetOps(sheetId: string): Promise<PendingSheetOps[]> {
  const body = (await internalPost(
    `/internal/sheet/${encodeURIComponent(sheetId)}/ops/claim`,
    {}
  )) as { batches?: unknown };
  return Array.isArray(body.batches) ? (body.batches as PendingSheetOps[]) : [];
}

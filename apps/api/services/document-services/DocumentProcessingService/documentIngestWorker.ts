/**
 * Drains uploaded documents into the vector index.
 *
 * The `documents` table *is* the queue — `status='uploaded'` is the pending
 * state. A separate job table would mean writing the same fact twice and
 * drifting exactly the way `document_count` drifted.
 *
 * Claiming follows the pattern the board-agent and schedule workers already
 * use (`FOR UPDATE SKIP LOCKED`), so running this in every cluster worker is
 * safe and parallel OCR is a throughput win rather than a race.
 *
 * What this fixes beyond throughput: before, ingestion was a fire-and-forget
 * promise started when documents were attached to a notebook. A deploy in the
 * middle of a run left the row on `processing` forever, and a wizard the user
 * abandoned left it on `uploaded` forever. Both are now reclaimed by the stale
 * sweep below.
 */
import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import { createIntervalWorker } from '../../../utils/intervalWorker.js';
import { createLogger } from '../../../utils/logger.js';
import { reportBackgroundError } from '../../../utils/reportBackgroundError.js';
import { getQdrantDocumentService } from '../DocumentSearchService/index.js';
import { getPostgresDocumentService } from '../PostgresDocumentService/index.js';

import { processUploadedDocument } from './fileProcessing.js';

const log = createLogger('DocumentIngest');

/**
 * How long a document may sit in `processing` before we assume the worker that
 * claimed it died. Generous: OCR of a large scanned PDF plus embedding can run
 * for several minutes, and reclaiming a run that is still alive wastes an
 * expensive pipeline.
 */
const STALE_PROCESSING_MS = 20 * 60 * 1000;

/** Give up after this many claims so a poison document cannot loop forever. */
const MAX_ATTEMPTS = 3;

const TICK_INTERVAL_MS = 15_000;

/** Bounds one tick so a large backlog cannot starve the interval. */
const MAX_PER_TICK = 25;

interface ClaimedDocument {
  id: string;
  user_id: string;
}

/**
 * Mark documents that burned through their attempts as failed. Without this a
 * document that crashes the pipeline every time would be re-claimed forever and
 * the user would never learn why it stays unsearchable.
 */
async function failExhaustedDocuments(): Promise<number> {
  const postgres = getPostgresInstance();
  const rows = (await postgres.query(
    `UPDATE documents
        SET status = 'failed',
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
              'processing_error',
              'Die Verarbeitung wurde mehrfach abgebrochen. Bitte lade die Datei erneut hoch.'
            )
      WHERE status = 'processing'
        AND processing_attempts >= $1
        AND processing_started_at < NOW() - ($2::text || ' milliseconds')::interval
      RETURNING id`,
    [MAX_ATTEMPTS, String(STALE_PROCESSING_MS)]
  )) as Array<{ id: string }>;

  if (rows.length > 0) {
    log.error(
      `${rows.length} Dokument(e) nach ${MAX_ATTEMPTS} Versuchen aufgegeben: ${rows
        .map((r) => r.id)
        .join(', ')}`
    );
  }
  return rows.length;
}

/**
 * Atomically take ownership of one document. Picks up fresh uploads and rows
 * abandoned mid-flight by a dead process alike — the second case is what makes
 * a deploy during ingestion survivable.
 */
async function claimNextDocument(): Promise<ClaimedDocument | null> {
  const postgres = getPostgresInstance();
  const rows = (await postgres.query(
    `UPDATE documents
        SET status = 'processing',
            processing_started_at = NOW(),
            processing_attempts = COALESCE(processing_attempts, 0) + 1
      WHERE id = (
        SELECT id
          FROM documents
         WHERE (
                 status = 'uploaded'
                 OR (
                   status = 'processing'
                   AND processing_started_at < NOW() - ($1::text || ' milliseconds')::interval
                 )
               )
           AND COALESCE(processing_attempts, 0) < $2
         ORDER BY created_at
           FOR UPDATE SKIP LOCKED
         LIMIT 1
      )
      RETURNING id, user_id`,
    [String(STALE_PROCESSING_MS), MAX_ATTEMPTS]
  )) as ClaimedDocument[];

  return rows[0] ?? null;
}

let draining = false;

/**
 * Process claimed documents until the queue runs dry. Re-entrant by design:
 * a second call while a drain is in flight returns immediately, because the
 * running drain will pick up whatever was just enqueued.
 */
export async function drainIngestQueue(): Promise<number> {
  if (draining) return 0;
  draining = true;

  let processed = 0;
  try {
    await failExhaustedDocuments();

    const pgDocService = getPostgresDocumentService();
    const qdrantDocService = getQdrantDocumentService();

    while (processed < MAX_PER_TICK) {
      const claimed = await claimNextDocument();
      if (!claimed) break;

      processed++;
      try {
        await processUploadedDocument(pgDocService, qdrantDocService, claimed.id, claimed.user_id);
      } catch (err) {
        // processUploadedDocument already writes status='failed' plus the
        // reason; reporting keeps the failure visible in Sentry as well.
        reportBackgroundError(err, {
          job: 'document-ingest',
          docId: claimed.id,
          userId: claimed.user_id,
        });
      }
    }
  } finally {
    draining = false;
  }

  if (processed > 0) log.info(`${processed} Dokument(e) verarbeitet`);
  return processed;
}

/**
 * Nudge the worker after an upload so the user does not wait for the next tick.
 * Fire-and-forget on purpose: the caller is an HTTP handler that must return
 * immediately, and a missed kick only costs one interval of latency.
 */
export function kickIngestWorker(): void {
  void drainIngestQueue().catch((err) => {
    reportBackgroundError(err, { job: 'document-ingest-kick' });
  });
}

const worker = createIntervalWorker({
  name: 'DocumentIngest',
  intervalMs: TICK_INTERVAL_MS,
  tick: async () => {
    await drainIngestQueue();
  },
});

export function startDocumentIngestWorker(): void {
  worker.start();
}

export function stopDocumentIngestWorker(): void {
  worker.stop();
}

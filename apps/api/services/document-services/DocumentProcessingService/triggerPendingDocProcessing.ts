import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import { createLogger } from '../../../utils/logger.js';

import { kickIngestWorker } from './documentIngestWorker.js';

const log = createLogger('document-processing:trigger');

interface TriggerPendingDocProcessingParams {
  documentIds: readonly string[];
  userId: string;
  logScope: string;
  collectionId?: string;
}

/**
 * Nudge the ingest worker for any of `documentIds` still waiting to be indexed.
 * The returned count is for logging only.
 *
 * This used to start `processUploadedDocument` itself, one detached promise per
 * document. That made attaching documents to a notebook the *only* thing that
 * ever began indexing: an upload the user never attached stayed raw forever,
 * and a process dying mid-run stranded the row on 'processing' with nobody
 * looking. The worker owns that lifecycle now, so this is only a "don't wait
 * for the next tick" signal — a lost kick costs latency, never correctness.
 *
 * Callers are responsible for upstream gating (e.g. selection_mode !== 'wolke').
 */
export async function triggerPendingDocProcessing({
  documentIds,
  userId,
  logScope,
  collectionId,
}: TriggerPendingDocProcessingParams): Promise<{ pendingCount: number }> {
  if (documentIds.length === 0) return { pendingCount: 0 };

  const postgres = getPostgresInstance();
  const pendingDocs = (await postgres.query(
    `SELECT id FROM documents WHERE id = ANY($1) AND user_id = $2 AND status = 'uploaded'`,
    [documentIds, userId]
  )) as Array<{ id: string }>;

  if (pendingDocs.length === 0) return { pendingCount: 0 };

  const collectionSuffix = collectionId ? ` in collection ${collectionId}` : '';
  log.info(
    `[${logScope}] ${pendingDocs.length} Dokument(e) warten auf Indexierung${collectionSuffix} — Worker geweckt`
  );

  kickIngestWorker();

  return { pendingCount: pendingDocs.length };
}

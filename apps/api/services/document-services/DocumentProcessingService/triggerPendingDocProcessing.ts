import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import { createLogger } from '../../../utils/logger.js';
import { getPostgresDocumentService } from '../PostgresDocumentService/index.js';
import { getQdrantDocumentService } from '../DocumentSearchService/index.js';

import { processUploadedDocument } from './fileProcessing.js';

const log = createLogger('document-processing:trigger');

interface TriggerPendingDocProcessingParams {
  documentIds: readonly string[];
  userId: string;
  logScope: string;
  collectionId?: string;
}

/**
 * Fire-and-forget: kick off deferred processing for any of `documentIds` that
 * are still in 'uploaded' state. Returns the number of docs whose processing
 * was triggered (already-completed/processing docs are skipped).
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

  const collectionSuffix = collectionId ? ` in collection ${collectionId}` : '';
  log.info(
    `[${logScope}] firing processUploadedDocument for ${pendingDocs.length} doc(s)${collectionSuffix}`
  );

  if (pendingDocs.length === 0) return { pendingCount: 0 };

  const pgDocService = getPostgresDocumentService();
  const qdrantDocService = getQdrantDocumentService();
  for (const doc of pendingDocs) {
    processUploadedDocument(pgDocService, qdrantDocService, doc.id, userId).catch((err) => {
      log.error(
        `[${logScope}] Background processing failed for doc ${doc.id}${collectionSuffix}:`,
        err
      );
    });
  }

  return { pendingCount: pendingDocs.length };
}

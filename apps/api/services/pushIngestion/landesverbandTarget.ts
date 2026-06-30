/**
 * Push-ingest target: Landesverband system collection.
 *
 * Reuses the exact scraper pipeline (DocumentProcessor via the shared factory) so
 * a pushed article and a scraped article are byte-for-byte interchangeable in
 * Qdrant — same point ids, same dedup-by-source_url, same `recordSyncEvent`. The
 * only thing this adds over the scraper is the push heartbeat touch, which makes
 * the scheduled scraper back off for an actively-pushing source.
 */
import { getSourceById } from '../../config/landesverbaendeConfig.js';
import { getQdrantInstance } from '../../database/services/QdrantService/index.js';
import {
  batchDelete,
  scrollDocuments,
} from '../../database/services/QdrantService/operations/batchOperations.js';
import { mistralEmbeddingService } from '../mistral/index.js';

import { createDocumentProcessor } from './documentProcessorFactory.js';
import { PushIngestError } from './errors.js';
import { touchPushHeartbeat } from './pushHeartbeat.js';

import type { PushAction, PushContentType } from '@gruenerator/contracts';

const DEFAULT_LV_COLLECTION = 'landesverbaende_documents';

export interface LandesverbandIngestInput {
  sourceId: string;
  contentType: PushContentType;
  sourceUrl: string;
  title: string;
  contentText: string;
  publishedAt?: string | null;
  categories?: string[];
}

export interface IngestOutcome {
  action: PushAction;
  documentId: string | null;
  vectors: number | null;
  reason: string | null;
}

export interface DeleteOutcome {
  action: PushAction;
  removed: number;
}

async function getQdrantClient() {
  const qdrant = getQdrantInstance();
  await qdrant.init();
  if (!qdrant.client) throw new PushIngestError(500, 'Qdrant client unavailable');
  return qdrant.client;
}

/**
 * Ingest one Landesverband article. Resolves the source, runs the shared
 * DocumentProcessor pipeline, and touches the push heartbeat.
 */
export async function ingestLandesverbandArticle(
  input: LandesverbandIngestInput
): Promise<IngestOutcome> {
  const source = getSourceById(input.sourceId);
  if (!source) throw new PushIngestError(422, `Unknown sourceId: ${input.sourceId}`);

  await mistralEmbeddingService.init();
  const client = await getQdrantClient();
  const targetCollection = source.qdrantCollection || DEFAULT_LV_COLLECTION;
  const processor = createDocumentProcessor(client, targetCollection);

  const result = await processor.processAndStoreDocument(
    source,
    input.contentType,
    input.sourceUrl,
    {
      title: input.title,
      text: input.contentText,
      publishedAt: input.publishedAt ?? null,
      categories: input.categories ?? [],
    },
    targetCollection,
    source.maxAgeYears
  );

  // Best-effort: the article did arrive, even if dedup skipped re-embedding.
  await touchPushHeartbeat(source.id);

  if (!result.stored) {
    return {
      action: 'skipped',
      documentId: null,
      vectors: null,
      reason: result.reason ?? 'not_stored',
    };
  }
  return {
    action: result.updated ? 'updated' : 'stored',
    documentId: null,
    vectors: result.vectors ?? null,
    reason: null,
  };
}

/**
 * Delete a previously-pushed Landesverband article by source url (all chunks).
 */
export async function deleteLandesverbandArticle(
  sourceId: string,
  sourceUrl: string
): Promise<DeleteOutcome> {
  const source = getSourceById(sourceId);
  if (!source) throw new PushIngestError(422, `Unknown sourceId: ${sourceId}`);

  const client = await getQdrantClient();
  const targetCollection = source.qdrantCollection || DEFAULT_LV_COLLECTION;
  const filter = { must: [{ key: 'source_url', match: { value: sourceUrl } }] };

  // Count chunks before deleting (so we can report removed=0 → 'skipped').
  const existing = await scrollDocuments(client, targetCollection, filter, {
    limit: 256,
    withPayload: false,
    withVector: false,
  });

  await touchPushHeartbeat(source.id);

  if (existing.length === 0) {
    return { action: 'skipped', removed: 0 };
  }

  await batchDelete(client, targetCollection, filter);
  return { action: 'deleted', removed: existing.length };
}

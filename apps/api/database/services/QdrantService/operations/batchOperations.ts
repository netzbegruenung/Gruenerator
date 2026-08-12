/**
 * Batch Operations
 * Batch upsert, delete, scroll, and health check
 */

import { type QdrantClient, type Schemas } from '@qdrant/js-client-rest';

import { BM25_SPARSE_VECTOR_NAME } from '../../../../config/qdrantCollectionsSchema.js';
import { encodeBm25Document } from '../../../../services/text/bm25.js';
import { createLogger } from '../../../../utils/logger.js';

import type {
  BatchUpsertOptions,
  BatchUpsertResult,
  BatchDeleteResult,
  ScrollOptions,
  ScrollPoint,
  QdrantFilter,
  CollectionStats,
} from './types.js';

const logger = createLogger('QdrantOperations:batchOperations');

interface QdrantPoint {
  id: number;
  vector: number[];
  payload: Record<string, unknown>;
}

type NamedVectorPoint = Omit<QdrantPoint, 'vector'> & {
  vector: Record<string, number[] | { indices: number[]; values: number[] }>;
};

const bm25SupportCache = new Map<string, boolean>();

/**
 * Whether a collection declares the `bm25` sparse vector. Upserting a named
 * sparse vector into a collection without it fails hard, so callers must gate
 * on this until every collection is migrated. Positive AND negative results
 * are cached; the negative cache entry is cleared by the migration script's
 * process (fresh processes re-check), which is acceptable because migration
 * requires a restart-free re-check only in the long-lived API — after
 * migrating, restart or wait for natural process recycling.
 */
export async function collectionSupportsBm25(
  client: QdrantClient,
  collection: string
): Promise<boolean> {
  const cached = bm25SupportCache.get(collection);
  if (cached !== undefined) return cached;
  try {
    const info = await client.getCollection(collection);
    const sparseVectors = (info.config?.params as Record<string, unknown> | undefined)?.[
      'sparse_vectors'
    ] as Record<string, unknown> | undefined;
    const supported = Boolean(sparseVectors?.[BM25_SPARSE_VECTOR_NAME]);
    bm25SupportCache.set(collection, supported);
    return supported;
  } catch {
    return false;
  }
}

/**
 * Attach a BM25 sparse vector derived from `payload.chunk_text` alongside the
 * (unnamed) dense vector. Points without chunk_text stay dense-only — Qdrant
 * accepts both shapes in the same collection, and search degrades gracefully.
 * The collection must declare the `bm25` sparse vector (all collections
 * created via COLLECTION_SCHEMAS do; older ones need the copy migration).
 */
export function withBm25Vector(point: QdrantPoint): QdrantPoint | NamedVectorPoint {
  const chunkText = point.payload?.chunk_text;
  if (typeof chunkText !== 'string' || chunkText.length === 0) return point;

  const sparse = encodeBm25Document(chunkText);
  if (sparse.indices.length === 0) return point;

  return {
    ...point,
    vector: { '': point.vector, [BM25_SPARSE_VECTOR_NAME]: sparse },
  };
}

/**
 * Convenience for callers that upsert via `client.upsert` directly: attaches
 * BM25 sparse vectors when the collection supports them, else returns the
 * points unchanged.
 */
export async function enrichPointsWithBm25(
  client: QdrantClient,
  collection: string,
  points: QdrantPoint[]
): Promise<Array<QdrantPoint | NamedVectorPoint>> {
  const supported = await collectionSupportsBm25(client, collection);
  return supported ? points.map(withBm25Vector) : points;
}

/**
 * Batch upsert points to collection with retry logic
 */
export async function batchUpsert(
  client: QdrantClient,
  collection: string,
  points: QdrantPoint[],
  options: BatchUpsertOptions = {}
): Promise<BatchUpsertResult> {
  const { wait = true, maxRetries = 3 } = options;
  let lastError: Error | null = null;

  const supportsBm25 = await collectionSupportsBm25(client, collection);
  const enrichedPoints = supportsBm25 ? points.map(withBm25Vector) : points;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await client.upsert(collection, {
        wait: wait,
        points: enrichedPoints,
      });

      logger.info(`Batch upserted ${points.length} points to ${collection}`);
      return {
        success: true,
        pointsUpserted: points.length,
        collection: collection,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.warn(`Batch upsert attempt ${attempt}/${maxRetries} failed: ${lastError.message}`);

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`Batch upsert failed after ${maxRetries} attempts: ${lastError?.message}`);
}

/**
 * Batch delete points by filter
 */
export async function batchDelete(
  client: QdrantClient,
  collection: string,
  filter: QdrantFilter
): Promise<BatchDeleteResult> {
  try {
    await client.delete(collection, { filter: filter as Schemas['Filter'] });

    logger.info(`Batch deleted points from ${collection}`);
    return { success: true, collection };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Batch delete failed: ${message}`);
    throw new Error(`Batch delete failed: ${message}`);
  }
}

/**
 * Scroll through documents with filter
 */
export async function scrollDocuments(
  client: QdrantClient,
  collection: string,
  filter: QdrantFilter = {},
  options: ScrollOptions = {}
): Promise<ScrollPoint[]> {
  const { limit = 100, withPayload = true, withVector = false, offset = null } = options;

  if (limit <= 0) {
    logger.warn(`Invalid limit value: ${limit}. Returning empty array.`);
    return [];
  }

  try {
    const scrollParams: Record<string, unknown> = {
      filter: Object.keys(filter).length > 0 ? filter : undefined,
      limit,
      with_payload: withPayload,
      with_vector: withVector,
    };

    if (offset !== null) {
      scrollParams.offset = offset;
    }

    const result = await client.scroll(collection, scrollParams);

    return (result.points || []).map((p) => ({
      id: p.id,
      payload: (p.payload as Record<string, unknown>) || {},
      vector: withVector ? (p.vector as number[]) || null : null,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Scroll failed: ${message}`);

    if (
      message.includes('SSL') ||
      message.includes('wrong version') ||
      message.includes('fetch failed')
    ) {
      logger.warn('Connection error detected, suggesting connection reset');
    }

    throw new Error(`Scroll operation failed: ${message}`);
  }
}

/**
 * Health check for Qdrant connection
 */
export async function healthCheck(client: QdrantClient): Promise<boolean> {
  try {
    await client.getCollections();
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Health check failed: ${message}`);
    return false;
  }
}

/**
 * Get collection statistics
 */
export async function getCollectionStats(
  client: QdrantClient,
  collection: string
): Promise<CollectionStats> {
  try {
    const info = await client.getCollection(collection);
    const infoData = info as Record<string, unknown>;

    const vectorsCount = (infoData.vectors_count ?? infoData.points_count) as
      number | null | undefined;
    const indexedVectorsCount = info.indexed_vectors_count as number | null | undefined;
    const pointsCount = info.points_count as number | null | undefined;
    return {
      name: collection,
      ...(vectorsCount != null && { vectors_count: vectorsCount }),
      ...(indexedVectorsCount != null && { indexed_vectors_count: indexedVectorsCount }),
      ...(pointsCount != null && { points_count: pointsCount }),
      status: info.status,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to get collection stats: ${message}`);
    return { name: collection, error: message };
  }
}

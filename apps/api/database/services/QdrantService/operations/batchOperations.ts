/**
 * Batch Operations
 * Batch upsert, delete, scroll, and health check
 */

import { QdrantClient } from '@qdrant/js-client-rest';
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

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await client.upsert(collection, {
        wait: wait,
        points: points,
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
    await client.delete(collection, { filter });

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
      | number
      | null
      | undefined;
    const indexedVectorsCount = info.indexed_vectors_count as number | null | undefined;
    const pointsCount = info.points_count as number | null | undefined;
    return {
      name: collection,
      vectors_count: vectorsCount ?? undefined,
      indexed_vectors_count: indexedVectorsCount ?? undefined,
      points_count: pointsCount ?? undefined,
      status: info.status,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to get collection stats: ${message}`);
    return { name: collection, error: message };
  }
}

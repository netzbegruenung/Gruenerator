/**
 * Context Retrieval Operations
 * Fetch chunks with surrounding context
 */

import { type QdrantClient } from '@qdrant/js-client-rest';

import { createLogger } from '../../../../utils/logger.js';

import type { ContextOptions, ChunkWithContext } from './types.js';

const logger = createLogger('QdrantOperations:contextRetrieval');

/**
 * Fetch a chunk and its nearby context from the same document
 */
export async function getChunkWithContext(
  client: QdrantClient,
  collection: string,
  pointOrId: string | number | { id: string | number; payload: Record<string, unknown> },
  options: ContextOptions = {}
): Promise<ChunkWithContext> {
  const { window = 1 } = options;
  let point: { id: string | number; payload: Record<string, unknown> } | null = null;

  if (typeof pointOrId === 'string' || typeof pointOrId === 'number') {
    try {
      const res = await client.retrieve(collection, {
        ids: [pointOrId],
        with_payload: true,
        with_vector: false,
      });
      const retrieved = res?.[0];
      if (retrieved) {
        point = {
          id: retrieved.id,
          payload: (retrieved.payload as Record<string, unknown>) || {},
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to retrieve point ${pointOrId}: ${message}`);
      return { center: null, context: [] };
    }
  } else {
    point = pointOrId;
  }

  if (!point?.payload) {
    return { center: null, context: [] };
  }

  const docId = point.payload.document_id as string;
  const idx = (point.payload.chunk_index as number) ?? 0;

  // Fetch neighbors by chunk_index +/- window
  const filter = {
    must: [
      { key: 'document_id', match: { value: docId } },
      { key: 'chunk_index', range: { gte: Math.max(0, idx - window), lte: idx + window } },
    ],
  };

  try {
    const scroll = await client.scroll(collection, {
      filter,
      limit: 100,
      with_payload: true,
      with_vector: false,
    });

    const points = (scroll.points || [])
      .map((p) => ({
        id: p.id,
        payload: (p.payload as Record<string, unknown>) || {},
      }))
      .sort(
        (a, b) =>
          ((a.payload.chunk_index as number) ?? 0) - ((b.payload.chunk_index as number) ?? 0)
      );

    return {
      center: point,
      context: points,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to fetch context for chunk: ${message}`);
    return { center: point, context: [] };
  }
}

/**
 * ChunkContext - Retrieve neighboring chunks from the same document
 * Provides fuller context for LLM answers
 */

import type { VectorSearchResult, ChunkContext, QdrantFilter } from './types';

export interface ChunkContextOptions {
  /** Number of chunks before and after the target chunk */
  window?: number;
  /** Maximum total chunks to return */
  maxChunks?: number;
}

export interface QdrantClientLike {
  scroll(
    collection: string,
    params: {
      filter: QdrantFilter;
      limit: number;
      with_payload: boolean;
      with_vector: boolean;
    }
  ): Promise<{ points: Array<{ id: string | number; payload: Record<string, unknown> }> }>;

  retrieve?(
    collection: string,
    params: {
      ids: Array<string | number>;
      with_payload: boolean;
      with_vector: boolean;
    }
  ): Promise<{ result: Array<{ id: string | number; payload: Record<string, unknown> }> }>;
}

/**
 * Get chunk with its surrounding context from the same document
 */
export async function getChunkWithContext(
  client: QdrantClientLike,
  collection: string,
  point: VectorSearchResult,
  options: ChunkContextOptions = {}
): Promise<ChunkContext> {
  const { window = 1, maxChunks = 10 } = options;

  if (!point?.payload) {
    return { center: null, context: [] };
  }

  const docId = point.payload.document_id as string | undefined;
  const chunkIndex = (point.payload.chunk_index as number) ?? 0;

  if (!docId) {
    return { center: point, context: [point] };
  }

  // Build filter for neighboring chunks
  const filter: QdrantFilter = {
    must: [
      { key: 'document_id', match: { value: docId } },
      {
        key: 'chunk_index',
        range: {
          gte: Math.max(0, chunkIndex - window),
          lte: chunkIndex + window,
        },
      },
    ],
  };

  try {
    const scrollResult = await client.scroll(collection, {
      filter,
      limit: Math.min(maxChunks, window * 2 + 10),
      with_payload: true,
      with_vector: false,
    });

    const points = (scrollResult.points || [])
      .sort((a, b) => {
        const aIdx = (a.payload?.chunk_index as number) ?? 0;
        const bIdx = (b.payload?.chunk_index as number) ?? 0;
        return aIdx - bIdx;
      })
      .map((p) => ({
        id: p.id,
        score: 0,
        payload: p.payload || {},
        text: (p.payload?.chunk_text as string) || '',
        title: (p.payload?.title as string) || (p.payload?.metadata as Record<string, unknown>)?.title as string || '',
      })) as VectorSearchResult[];

    return {
      center: point,
      context: points,
    };
  } catch (error) {
    console.error('[ChunkContext] Failed to get context:', error);
    return { center: point, context: [point] };
  }
}

/**
 * Get context for multiple chunks, grouped by document
 */
export async function getBatchChunkContext(
  client: QdrantClientLike,
  collection: string,
  points: VectorSearchResult[],
  options: ChunkContextOptions = {}
): Promise<Map<string, ChunkContext>> {
  const results = new Map<string, ChunkContext>();

  // Group points by document_id
  const byDocument = new Map<string, VectorSearchResult[]>();
  for (const point of points) {
    const docId = point.payload?.document_id as string | undefined;
    if (!docId) continue;

    if (!byDocument.has(docId)) {
      byDocument.set(docId, []);
    }
    byDocument.get(docId)!.push(point);
  }

  // Fetch context for each document
  const promises = Array.from(byDocument.entries()).map(async ([docId, docPoints]) => {
    // Use the first point as the center
    const centerPoint = docPoints[0];
    const context = await getChunkWithContext(client, collection, centerPoint, options);
    results.set(docId, context);
  });

  await Promise.all(promises);

  return results;
}

/**
 * Merge chunk context into a single text block
 */
export function mergeContextText(context: ChunkContext): string {
  if (!context.context || context.context.length === 0) {
    return context.center?.text || '';
  }

  return context.context
    .map((chunk) => chunk.text || (chunk.payload?.chunk_text as string) || '')
    .filter((text) => text.length > 0)
    .join('\n\n');
}

/**
 * Get context window around a specific chunk index
 */
export async function getContextWindow(
  client: QdrantClientLike,
  collection: string,
  documentId: string,
  centerIndex: number,
  options: ChunkContextOptions = {}
): Promise<VectorSearchResult[]> {
  const { window = 1, maxChunks = 10 } = options;

  const filter: QdrantFilter = {
    must: [
      { key: 'document_id', match: { value: documentId } },
      {
        key: 'chunk_index',
        range: {
          gte: Math.max(0, centerIndex - window),
          lte: centerIndex + window,
        },
      },
    ],
  };

  try {
    const scrollResult = await client.scroll(collection, {
      filter,
      limit: Math.min(maxChunks, window * 2 + 5),
      with_payload: true,
      with_vector: false,
    });

    return (scrollResult.points || [])
      .sort((a, b) => {
        const aIdx = (a.payload?.chunk_index as number) ?? 0;
        const bIdx = (b.payload?.chunk_index as number) ?? 0;
        return aIdx - bIdx;
      })
      .map((p) => ({
        id: p.id,
        score: 0,
        payload: p.payload || {},
        text: (p.payload?.chunk_text as string) || '',
        title: (p.payload?.title as string) || '',
      })) as VectorSearchResult[];
  } catch (error) {
    console.error('[ChunkContext] Failed to get window:', error);
    return [];
  }
}

/**
 * Expand search results with context from neighboring chunks
 */
export async function expandResultsWithContext(
  client: QdrantClientLike,
  collection: string,
  results: VectorSearchResult[],
  options: ChunkContextOptions = {}
): Promise<VectorSearchResult[]> {
  const { window = 1 } = options;

  // Deduplicate results by document and chunk index
  const seen = new Set<string>();
  const expanded: VectorSearchResult[] = [];

  for (const result of results) {
    const docId = result.payload?.document_id as string;
    const chunkIdx = result.payload?.chunk_index as number;

    if (!docId) {
      expanded.push(result);
      continue;
    }

    const key = `${docId}:${chunkIdx}`;
    if (seen.has(key)) continue;

    // Get context for this result
    const context = await getChunkWithContext(client, collection, result, { window });

    // Add all context chunks (they'll be deduplicated)
    for (const chunk of context.context) {
      const chunkKey = `${docId}:${chunk.payload?.chunk_index}`;
      if (!seen.has(chunkKey)) {
        seen.add(chunkKey);
        expanded.push(chunk);
      }
    }
  }

  return expanded;
}

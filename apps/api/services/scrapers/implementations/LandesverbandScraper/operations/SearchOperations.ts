/**
 * Search Operations
 * Semantic search and collection statistics
 */

import { mistralEmbeddingService } from '../../../../mistral/index.js';
import { LANDESVERBAENDE_CONFIG } from '../../../../../config/landesverbaendeConfig.js';
import type { LandesverbandSearchOptions, LandesverbandSearchResult } from '../types.js';

/**
 * Search operations for Landesverbände collection
 * Handles semantic search with filters and collection stats
 */
export class SearchOperations {
  constructor(
    private qdrant: any,
    private collectionName: string
  ) {}

  /**
   * Search documents by semantic query
   * Supports filtering by source, Landesverband, type, and content type
   */
  async searchDocuments(
    query: string,
    options: LandesverbandSearchOptions = {}
  ): Promise<{ results: LandesverbandSearchResult[]; total: number }> {
    const { sourceId = null, landesverband = null, sourceType = null, contentType = null, limit = 10, threshold = 0.35 } = options;

    // Generate query embedding
    const queryVector = await mistralEmbeddingService.generateQueryEmbedding(query);

    // Build filter from options
    const filter: any = { must: [] };
    if (sourceId) filter.must.push({ key: 'source_id', match: { value: sourceId } });
    if (landesverband) filter.must.push({ key: 'landesverband', match: { value: landesverband } });
    if (sourceType) filter.must.push({ key: 'source_type', match: { value: sourceType } });
    if (contentType) filter.must.push({ key: 'content_type', match: { value: contentType } });

    // Search Qdrant
    const searchResult = await this.qdrant.client.search(this.collectionName, {
      vector: queryVector,
      filter: filter.must.length > 0 ? filter : undefined,
      limit: limit * 3, // Get more results for deduplication
      score_threshold: threshold,
      with_payload: true,
    });

    // Deduplicate by document_id (one result per document)
    const documentsMap = new Map<string, LandesverbandSearchResult>();
    for (const hit of searchResult) {
      const docId = hit.payload.document_id;
      if (!documentsMap.has(docId)) {
        documentsMap.set(docId, {
          id: docId,
          score: hit.score,
          title: hit.payload.title,
          sourceId: hit.payload.source_id,
          sourceName: hit.payload.source_name,
          landesverband: hit.payload.landesverband,
          sourceType: hit.payload.source_type,
          contentType: hit.payload.content_type,
          contentTypeLabel: hit.payload.content_type_label,
          source_url: hit.payload.source_url,
          publishedAt: hit.payload.published_at,
          matchedChunk: hit.payload.chunk_text,
        });
      }

      if (documentsMap.size >= limit) break;
    }

    return {
      results: Array.from(documentsMap.values()),
      total: documentsMap.size,
    };
  }

  /**
   * Get collection statistics
   * Returns vector count, points count, and per-source stats
   */
  async getStats(): Promise<any> {
    try {
      const info = await this.qdrant.client.getCollection(this.collectionName);

      // Collect per-source statistics
      const sourceStats: Record<string, any> = {};
      for (const source of (LANDESVERBAENDE_CONFIG as any).sources) {
        try {
          const result = await this.qdrant.client.count(this.collectionName, {
            filter: {
              must: [{ key: 'source_id', match: { value: source.id } }],
            },
          });
          sourceStats[source.id] = {
            name: source.name,
            type: source.type,
            vectors: result.count || 0,
          };
        } catch {
          sourceStats[source.id] = { name: source.name, type: source.type, vectors: 0 };
        }
      }

      return {
        collection: this.collectionName,
        vectors_count: info.vectors_count,
        points_count: info.points_count,
        status: info.status,
        sources: sourceStats,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { error: errorMessage };
    }
  }
}

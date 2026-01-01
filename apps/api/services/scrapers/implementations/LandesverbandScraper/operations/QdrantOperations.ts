/**
 * Qdrant Operations
 * All database CRUD operations isolated for easy testing/mocking
 */

import type { ExistingDocument } from '../types.js';

/**
 * Qdrant database operations layer
 * All vector database interactions go through this class
 */
export class QdrantOperations {
  constructor(
    private qdrant: any,
    private collectionName: string
  ) {}

  /**
   * Check if document exists in Qdrant by source URL
   * Returns document metadata if exists, null otherwise
   */
  async documentExists(url: string): Promise<ExistingDocument | null> {
    try {
      const result = await this.qdrant.client.scroll(this.collectionName, {
        filter: {
          must: [{ key: 'source_url', match: { value: url } }],
        },
        limit: 1,
        with_payload: ['content_hash', 'indexed_at'],
        with_vector: false,
      });

      if (result.points && result.points.length > 0) {
        return result.points[0].payload as ExistingDocument;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Delete document from Qdrant by source URL
   * Removes all chunks associated with this document
   */
  async deleteDocument(url: string): Promise<void> {
    await this.qdrant.client.delete(this.collectionName, {
      filter: {
        must: [{ key: 'source_url', match: { value: url } }],
      },
    });
  }

  /**
   * Upsert points in batches for efficiency
   * Default batch size: 10 points per request
   */
  async upsertPoints(points: any[], batchSize: number = 10): Promise<void> {
    for (let i = 0; i < points.length; i += batchSize) {
      const batch = points.slice(i, i + batchSize);
      await this.qdrant.client.upsert(this.collectionName, { points: batch });
    }
  }

  /**
   * Clear all documents from specific source
   * Used for re-scraping a source from scratch
   */
  async clearSource(sourceId: string): Promise<void> {
    await this.qdrant.client.delete(this.collectionName, {
      filter: {
        must: [{ key: 'source_id', match: { value: sourceId } }],
      },
    });
  }

  /**
   * Get collection metadata
   * Returns vector count, points count, and status
   */
  async getCollectionInfo(): Promise<any> {
    return await this.qdrant.client.getCollection(this.collectionName);
  }

  /**
   * Count documents matching filter
   * Returns total number of points
   */
  async countDocuments(filter?: any): Promise<number> {
    const result = await this.qdrant.client.count(this.collectionName, { filter });
    return result.count || 0;
  }

  /**
   * Clear entire collection
   * Scrolls through all points and deletes in batches
   */
  async clearCollection(): Promise<void> {
    try {
      let offset: string | number | null = null;
      const points: number[] = [];

      // Collect all point IDs
      do {
        const result = await this.qdrant.client.scroll(this.collectionName, {
          limit: 100,
          offset: offset,
          with_payload: false,
          with_vector: false,
        });

        points.push(...result.points.map((p: any) => p.id));
        offset = result.next_page_offset;
      } while (offset);

      // Delete in batches
      if (points.length > 0) {
        for (let i = 0; i < points.length; i += 100) {
          const batch = points.slice(i, i + 100);
          await this.qdrant.client.delete(this.collectionName, {
            points: batch,
          });
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[QdrantOperations] Clear collection failed:', errorMessage);
    }
  }
}

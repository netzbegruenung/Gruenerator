/**
 * QdrantOperations - Reusable Qdrant operations for all search services
 * Main class that orchestrates search, batch, and context operations
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { vectorConfig } from '../../../../config/vectorConfig.js';
import { createLogger } from '../../../../utils/logger.js';

// Import operations from modules
import { vectorSearch, searchWithQuality, searchWithIntent } from './vectorSearch.js';
import { hybridSearch, performTextSearch, calculateTextSearchScore } from './hybridSearch.js';
import { getChunkWithContext } from './contextRetrieval.js';
import {
  batchUpsert,
  batchDelete,
  scrollDocuments,
  healthCheck,
  getCollectionStats,
} from './batchOperations.js';
import { mergeFilters } from './filterUtils.js';

// Import types
import type {
  VectorSearchOptions,
  VectorSearchResult,
  HybridSearchOptions,
  HybridSearchResponse,
  ContextOptions,
  ChunkWithContext,
  BatchUpsertOptions,
  BatchUpsertResult,
  BatchDeleteResult,
  ScrollOptions,
  ScrollPoint,
  QdrantFilter,
  CollectionStats,
  HybridConfig,
  TextSearchResult,
} from './types.js';

const logger = createLogger('QdrantOperations');

interface QdrantPoint {
  id: number;
  vector: number[];
  payload: Record<string, unknown>;
}

/**
 * QdrantOperations class
 * Provides high-level search algorithms and operations on top of QdrantService
 */
class QdrantOperations {
  public client: QdrantClient;
  private hybridConfig: HybridConfig;

  constructor(qdrantClient: QdrantClient) {
    this.client = qdrantClient;
    this.hybridConfig = vectorConfig.get('hybrid') as HybridConfig;
  }

  /**
   * Vector search with quality-aware filtering and boosting
   */
  async searchWithQuality(
    collection: string,
    queryVector: number[],
    filter: QdrantFilter = {},
    options: VectorSearchOptions = {}
  ): Promise<VectorSearchResult[]> {
    return searchWithQuality(this.client, collection, queryVector, filter, options);
  }

  /**
   * Intent-aware vector search
   */
  async searchWithIntent(
    collection: string,
    queryVector: number[],
    intent: { type: string; language: string; filter?: QdrantFilter } | null,
    baseFilter: QdrantFilter = {},
    options: VectorSearchOptions = {}
  ): Promise<VectorSearchResult[]> {
    return searchWithIntent(this.client, collection, queryVector, intent, baseFilter, options);
  }

  /**
   * Fetch a chunk and its nearby context
   */
  async getChunkWithContext(
    collection: string,
    pointOrId: string | number | { id: string | number; payload: Record<string, unknown> },
    options: ContextOptions = {}
  ): Promise<ChunkWithContext> {
    return getChunkWithContext(this.client, collection, pointOrId, options);
  }

  /**
   * Merge two Qdrant filters
   */
  mergeFilters(a: QdrantFilter = {}, b: QdrantFilter = {}): QdrantFilter {
    return mergeFilters(a, b);
  }

  /**
   * Perform vector similarity search
   */
  async vectorSearch(
    collection: string,
    queryVector: number[],
    filter: QdrantFilter = {},
    options: VectorSearchOptions = {}
  ): Promise<VectorSearchResult[]> {
    return vectorSearch(this.client, collection, queryVector, filter, options);
  }

  /**
   * Perform hybrid search combining vector and keyword search
   */
  async hybridSearch(
    collection: string,
    queryVector: number[],
    query: string,
    filter: QdrantFilter = {},
    options: HybridSearchOptions = {}
  ): Promise<HybridSearchResponse> {
    return hybridSearch(this.client, collection, queryVector, query, filter, options);
  }

  /**
   * Perform text-only search (keyword search without vectors)
   */
  async performTextSearch(
    collection: string,
    searchTerm: string,
    baseFilter: QdrantFilter = {},
    limit: number = 10
  ): Promise<TextSearchResult[]> {
    return performTextSearch(this.client, collection, searchTerm, baseFilter, limit);
  }

  /**
   * Batch upsert points to collection
   */
  async batchUpsert(
    collection: string,
    points: QdrantPoint[],
    options: BatchUpsertOptions = {}
  ): Promise<BatchUpsertResult> {
    return batchUpsert(this.client, collection, points, options);
  }

  /**
   * Batch delete points by filter
   */
  async batchDelete(collection: string, filter: QdrantFilter): Promise<BatchDeleteResult> {
    return batchDelete(this.client, collection, filter);
  }

  /**
   * Scroll through documents with filter
   */
  async scrollDocuments(
    collection: string,
    filter: QdrantFilter = {},
    options: ScrollOptions = {}
  ): Promise<ScrollPoint[]> {
    return scrollDocuments(this.client, collection, filter, options);
  }

  /**
   * Health check for Qdrant connection
   */
  async healthCheck(): Promise<boolean> {
    return healthCheck(this.client);
  }

  /**
   * Get collection statistics
   */
  async getCollectionStats(collection: string): Promise<CollectionStats> {
    return getCollectionStats(this.client, collection);
  }
}

export { QdrantOperations };
export default QdrantOperations;

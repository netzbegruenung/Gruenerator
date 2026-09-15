/**
 * DocumentSearchService Search Operations Module
 *
 * Handles various search operations for documents:
 * - Text-only (keyword) search
 * - Vector similarity search
 * - Hybrid search (combining vector and text)
 * - Bundestag content search
 */

import { vectorConfig } from '../../../config/vectorConfig.js';

import type {
  DocumentSearchOptions,
  QdrantFilter,
  FindSimilarChunksParams,
  FindHybridChunksParams,
  DocumentTransformedChunk,
  BundestagSearchOptions,
  BundestagSearchResult,
  BundestagResultGroup,
  QdrantSearchResult,
  QdrantResultPayload,
} from './types.js';
import type { QdrantOperations } from '../../../database/services/QdrantOperations.js';
import type { QdrantService } from '../../../database/services/QdrantService.js';
import type { SearchResponse } from '../../BaseSearchService/types.js';

/**
 * Payload-derived fields shared by every search-mode chunk mapper.
 *
 * Single source of truth for "what we read off a Qdrant chunk payload" —
 * vector, hybrid AND text search all spread this. Centralizing it prevents
 * per-path field drift: a new payload field added here lands in all three
 * modes at once. (This is the structural fix for the class of bug where
 * `published_at` / `quality_score` / `page_number` were populated in the
 * vector + hybrid mappers but silently dropped in the text mapper.)
 *
 * Method-specific fields (id, similarity, searchMethod, originalVector/TextScore)
 * stay in the callers — they genuinely differ per mode.
 */
export function buildChunkPayloadFields(payload: QdrantResultPayload | undefined): {
  document_id: string;
  chunk_index: number;
  chunk_text: string;
  token_count: number | undefined;
  quality_score: number | null;
  content_type: string | null;
  page_number: number | null;
  chunk_type: string | null;
  created_at: string | undefined;
  published_at: string | null;
  source_id: string | null;
  url: string | undefined;
  documents: { id: string; title: string; filename: string; created_at: string | undefined };
} {
  const p = payload ?? ({} as QdrantResultPayload);
  const metadata = p.metadata as Record<string, unknown> | undefined;
  const documentId =
    (p.document_id as string) || (p.source_url as string) || (p.url as string) || '';
  return {
    document_id: documentId,
    chunk_index: (p.chunk_index as number) ?? 0,
    chunk_text: (p.chunk_text as string) ?? '',
    token_count: p.token_count as number | undefined,
    quality_score: (p.quality_score as number) ?? null,
    content_type: (p.content_type as string) ?? null,
    page_number: (p.page_number as number) ?? null,
    chunk_type: (p.chunk_type as string) ?? null,
    created_at: p.created_at as string | undefined,
    published_at: (p.published_at as string) ?? (metadata?.published_at as string) ?? null,
    source_id: (p.source_id as string) ?? null,
    url: (p.source_url as string) || (p.url as string) || undefined,
    documents: {
      id: documentId,
      title: (p.title as string) || (metadata?.title as string) || 'Untitled',
      filename: (p.filename as string) || (metadata?.filename as string) || '',
      created_at: p.created_at as string | undefined,
    },
  };
}

/**
 * Perform full-text (keyword-only) search over document chunks
 *
 * Uses Qdrant text index and aggregates results per document.
 * Does not use vector embeddings, only keyword matching.
 *
 * @param qdrantOps - QdrantOperations instance
 * @param query - Search query string
 * @param userId - User ID to filter results
 * @param options - Search options and filters
 * @param chunkMultiplier - Multiplier for initial chunk retrieval
 * @param groupAndRank - Function to aggregate chunks by document
 * @returns Search response with aggregated results
 */
export async function performTextSearch(
  qdrantOps: QdrantOperations,
  query: string,
  userId: string,
  options: DocumentSearchOptions,
  chunkMultiplier: number,
  groupAndRank: (chunks: DocumentTransformedChunk[], limit: number) => Promise<unknown[]>
): Promise<SearchResponse> {
  try {
    const limit = options.limit || 5;

    // searchCollection/additionalFilter live in DocumentSearchFilters but are
    // threaded through `options` here (SearchOptions has an index signature),
    // mirroring how documentIds/sourceType are already read below.
    const searchCollection = (options.searchCollection as string | undefined) || 'documents';
    const additionalFilter = options.additionalFilter as QdrantFilter | undefined;

    const scopedByDocumentIds = !!(
      options.documentIds &&
      Array.isArray(options.documentIds) &&
      options.documentIds.length > 0
    );

    const filter: QdrantFilter = { must: [] };

    // Mirror findSimilarChunks: only pin user_id on the per-user 'documents'
    // collection when not already scoped by an authorized documentId set.
    // System collections (LV/Landesverband etc.) have no user_id payload — a
    // user_id clause there would return zero hits, which was the original
    // "Volltext changes nothing" symptom on LV notebooks.
    if (searchCollection === 'documents' && !scopedByDocumentIds) {
      filter.must!.push({ key: 'user_id', match: { value: userId } });
    }

    if (scopedByDocumentIds) {
      filter.must!.push({
        key: 'document_id',
        match: { any: options.documentIds as (string | number)[] },
      });
    }

    if (options.sourceType) {
      filter.must!.push({ key: 'source_type', match: { value: options.sourceType as string } });
    }

    // Landesverband scoping (and any other caller-supplied facet filters).
    if (additionalFilter?.must) {
      filter.must!.push(...additionalFilter.must);
    }

    const rawResults = await qdrantOps.performTextSearch(
      searchCollection,
      query,
      filter,
      Math.round(limit * chunkMultiplier)
    );

    const chunks: DocumentTransformedChunk[] = (rawResults || []).map((result) => ({
      id: String(result.id),
      similarity: result.score || 0,
      // Shared mapper guarantees text results carry the same payload fields
      // (quality_score, page_number, source_id, content_type, published_at, …)
      // as vector/hybrid — previously these were silently dropped here.
      ...buildChunkPayloadFields(result.payload),
      searchMethod: 'text',
      originalVectorScore: null,
      originalTextScore: result.score || 0,
    }));

    if (chunks.length === 0) {
      return {
        success: true,
        results: [],
        query: query.trim(),
        searchType: 'text',
        message: 'No results found',
      };
    }

    const results = await groupAndRank(chunks, limit);

    return {
      success: true,
      results: results as SearchResponse['results'],
      query: query.trim(),
      searchType: 'text',
      message: `Found ${results.length} relevant document(s) using full-text search`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[SearchOperations] Text search error:', error);
    return {
      success: false,
      results: [],
      query: query.trim(),
      searchType: 'text',
      message: 'Search failed',
      error: errorMessage,
    };
  }
}

/**
 * Find similar chunks using vector similarity
 *
 * Searches Qdrant for semantically similar document chunks
 * using embedding vectors. Supports system collections.
 *
 * @param qdrantOps - QdrantOperations instance
 * @param qdrantAvailable - Whether Qdrant is available
 * @param params - Search parameters with embedding and filters
 * @returns Array of transformed chunks
 */
export async function findSimilarChunks(
  qdrantOps: QdrantOperations | null,
  qdrantAvailable: boolean,
  params: FindSimilarChunksParams
): Promise<DocumentTransformedChunk[]> {
  const { embedding, userId, filters, limit, threshold, query } = params;

  if (!qdrantAvailable || !qdrantOps) {
    console.warn('[SearchOperations] Skipping vector search: Qdrant unavailable');
    return [];
  }

  const searchCollection = filters.searchCollection || 'documents';
  console.log(`[SearchOperations] Vector searching collection: ${searchCollection}`);
  console.log(
    `[SearchOperations] DEBUG - embedding length: ${embedding?.length}, threshold: ${threshold}, limit: ${limit}`
  );
  console.log(
    `[SearchOperations] DEBUG - userId: ${userId}, filters:`,
    JSON.stringify(filters, null, 2)
  );

  const filter: QdrantFilter = { must: [] };

  const scopedByDocumentIds = !!(filters.documentIds && filters.documentIds.length > 0);

  // When documentIds is supplied the upstream caller (e.g. checkNotebookAccess
  // in NotebookQAService) has already authorized the viewer for exactly those
  // documents. The document_id filter below narrows Qdrant to that authorized
  // set; adding a user_id filter on top would exclude documents owned by
  // someone who shared their notebook with us, breaking shared-notebook search.
  if (searchCollection === 'documents' && !scopedByDocumentIds) {
    filter.must!.push({ key: 'user_id', match: { value: userId as string } });
  }

  if (scopedByDocumentIds) {
    filter.must!.push({
      key: 'document_id',
      match: { any: filters.documentIds! },
    });
  }

  if (filters.sourceType) {
    filter.must!.push({
      key: 'source_type',
      match: { value: filters.sourceType },
    });
  }

  if (filters.titleFilter) {
    filter.must!.push({
      key: 'title',
      match: { value: filters.titleFilter },
    });
  }

  if (filters.additionalFilter?.must) {
    filter.must!.push(...filters.additionalFilter.must);
  }

  // Note: quality_score filter is NOT applied here because most system collections
  // were indexed without this field. Quality filtering is handled post-search
  // in searchWithQuality() which gracefully handles missing quality_score values.
  // If collections are re-indexed with quality_score, this can be re-enabled.

  console.log(`[SearchOperations] DEBUG - Final filter:`, JSON.stringify(filter, null, 2));

  let results: QdrantSearchResult[];
  try {
    const intentCfg = vectorConfig.get('retrieval')?.queryIntent;
    if (intentCfg?.enabled) {
      const { queryIntentService } = await import('../../QueryIntentService/index.js');
      const intent = queryIntentService.detectIntent(query || '');
      results = await qdrantOps.searchWithIntent(searchCollection, embedding, intent, filter, {
        limit,
        threshold,
        withPayload: true,
      });
    } else {
      results = await qdrantOps.searchWithQuality(searchCollection, embedding, filter, {
        limit,
        threshold,
        withPayload: true,
      });
    }
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : 'Unknown error';
    console.warn(
      '[SearchOperations] Intent-aware search failed, falling back to quality search:',
      errorMsg
    );
    results = await qdrantOps.searchWithQuality(searchCollection, embedding, filter, {
      limit,
      threshold,
      withPayload: true,
    });
  }
  console.log(`[SearchOperations] Qdrant vectorSearch returned ${results.length} hits`);

  return results.map((result) => ({
    id: result.id,
    similarity: result.score,
    ...buildChunkPayloadFields(result.payload),
  }));
}

/**
 * Find hybrid chunks combining vector and text search
 *
 * Performs both semantic (vector) and keyword (text) search,
 * then combines results using configured fusion method.
 *
 * @param qdrantOps - QdrantOperations instance
 * @param qdrantAvailable - Whether Qdrant is available
 * @param params - Hybrid search parameters
 * @returns Array of transformed chunks with hybrid metadata
 */
export async function findHybridChunks(
  qdrantOps: QdrantOperations | null,
  qdrantAvailable: boolean,
  params: FindHybridChunksParams
): Promise<DocumentTransformedChunk[]> {
  const { embedding, query, userId, filters, limit, threshold, hybridOptions } = params;
  if (!qdrantAvailable || !qdrantOps) {
    console.warn('[SearchOperations] Skipping hybrid search: Qdrant unavailable');
    return [];
  }

  const searchCollection = filters.searchCollection || 'documents';
  console.log(`[SearchOperations] Searching collection: ${searchCollection}`);

  const filter: QdrantFilter = { must: [] };

  const scopedByDocumentIds = !!(filters.documentIds && filters.documentIds.length > 0);

  // When documentIds is supplied the upstream caller (e.g. checkNotebookAccess
  // in NotebookQAService) has already authorized the viewer for exactly those
  // documents. The document_id filter below narrows Qdrant to that authorized
  // set; adding a user_id filter on top would exclude documents owned by
  // someone who shared their notebook with us, breaking shared-notebook search.
  if (searchCollection === 'documents' && !scopedByDocumentIds) {
    filter.must!.push({ key: 'user_id', match: { value: userId as string } });
  }

  if (scopedByDocumentIds) {
    filter.must!.push({
      key: 'document_id',
      match: { any: filters.documentIds! },
    });
  }

  if (filters.sourceType) {
    filter.must!.push({
      key: 'source_type',
      match: { value: filters.sourceType },
    });
  }

  if (filters.titleFilter) {
    filter.must!.push({
      key: 'title',
      match: { value: filters.titleFilter },
    });
  }

  if (filters.additionalFilter?.must) {
    filter.must!.push(...filters.additionalFilter.must);
  }

  console.log('[SearchOperations] Calling Qdrant hybridSearch...');
  const hybridResult = await qdrantOps.hybridSearch(searchCollection, embedding, query, filter, {
    limit,
    threshold,
    ...hybridOptions,
  });
  console.log(
    `[SearchOperations] Qdrant hybridSearch returned ${hybridResult.results.length} hits`
  );

  // #3166 Fix-Runde 1: `dense_similarity_score` darf NUR aus dem
  // server-seitigen Score-Join kommen, nie aus der Alt-Fusion — beide liefern
  // `originalVectorScore` als echten Kosinus, aber nur auf dem Server-Pfad ist
  // der Kosinus mit `similarity_score` (dort ein reiner Fusionswert)
  // unvergleichbar genug, um einen eigenen Schnittwert zu rechtfertigen. Der
  // Alt-Pfad rechnet Begriffstreffer-/Diversitäts-/Hybrid-Boni auf denselben
  // Kosinus drauf, bevor er `similarity_score` wird — ein Schnitt gegen den
  // unboosteten Wert würde dort die Kontrollgruppe verschieben. `fusionMethod`
  // ist der Diskriminator: `${fusion}-server` NUR aus `hybridSearchServerSide`
  // (hybridSearch.ts), `'RRF' | 'weighted'` aus der Alt-Fusion.
  const viaServerScoreJoin = hybridResult.metadata?.fusionMethod?.endsWith('-server') ?? false;

  return hybridResult.results.map((result) => ({
    id: result.id,
    similarity: result.score,
    ...buildChunkPayloadFields(result.payload),
    searchMethod: result.searchMethod || 'hybrid',
    originalVectorScore: result.originalVectorScore ?? null,
    originalTextScore: result.originalTextScore ?? null,
    denseSimilarityScore: viaServerScoreJoin ? (result.originalVectorScore ?? null) : null,
  }));
}

/**
 * Search Bundestag content (gruene-bundestag.de crawled content)
 *
 * Searches the bundestag_content collection and groups results by URL
 * for better presentation of web content.
 *
 * @param qdrant - QdrantService instance
 * @param mistralEmbeddingService - Embedding service for query vectorization
 * @param query - Search query string
 * @param options - Bundestag search options
 * @returns Grouped search results by URL
 */
export async function searchBundestagContent(
  qdrant: QdrantService,
  mistralEmbeddingService: { generateEmbedding: (text: string) => Promise<number[]> },
  query: string,
  options: BundestagSearchOptions = {}
): Promise<BundestagSearchResult> {
  try {
    const { section = null, limit = 10, threshold = 0.3 } = options;

    const queryVector = await mistralEmbeddingService.generateEmbedding(query);

    const searchResult = await qdrant.searchBundestagDocuments(queryVector, {
      section,
      limit,
      threshold,
    });

    if (!searchResult.success) {
      return {
        success: false,
        results: [],
        error: 'Search failed',
      };
    }

    const urlGroups = new Map<string, BundestagResultGroup>();
    for (const result of searchResult.results) {
      const url = result.url as string;
      if (!urlGroups.has(url)) {
        urlGroups.set(url, {
          url,
          title: result.title as string,
          section: result.section as string,
          published_at: result.published_at as string,
          maxScore: result.score,
          chunks: [],
        });
      }
      const group = urlGroups.get(url)!;
      group.chunks.push({
        text: result.chunk_text as string,
        chunk_index: result.chunk_index as number,
        score: result.score,
      });
      if (result.score > group.maxScore) {
        group.maxScore = result.score;
      }
    }

    const groupedResults = Array.from(urlGroups.values())
      .sort((a, b) => b.maxScore - a.maxScore)
      .slice(0, limit);

    return {
      success: true,
      results: groupedResults,
      query: query.trim(),
      searchType: 'bundestag_content',
      totalHits: searchResult.total as number | undefined,
      message: `Found ${groupedResults.length} relevant page(s) from gruene-bundestag.de`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[SearchOperations] Bundestag search failed:', error);
    return {
      success: false,
      results: [],
      error: errorMessage,
    };
  }
}

/**
 * DocumentSearchService Search Operations Module
 *
 * Handles various search operations for documents:
 * - Text-only (keyword) search
 * - Vector similarity search
 * - Hybrid search (combining vector and text)
 * - Bundestag content search
 */

import type {
    DocumentSearchOptions,
    DocumentSearchFilters,
    QdrantFilter,
    FindSimilarChunksParams,
    FindHybridChunksParams,
    DocumentTransformedChunk,
    BundestagSearchOptions,
    BundestagSearchResult,
    BundestagResultGroup,
    QdrantSearchResult
} from './types.js';

import type { SearchResponse } from '../../BaseSearchService/types.js';
import type { QdrantOperations } from '../../../database/services/QdrantOperations.js';
import type { QdrantService } from '../../../database/services/QdrantService.js';

// Import JavaScript dependencies
// @ts-ignore - JavaScript module without types
import { vectorConfig } from '../../../config/vectorConfig.js';

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

        const filter: QdrantFilter = { must: [{ key: 'user_id', match: { value: userId } }] };

        if (options.documentIds && Array.isArray(options.documentIds) && options.documentIds.length > 0) {
            filter.must!.push({ key: 'document_id', match: { any: options.documentIds } });
        }

        if (options.sourceType) {
            filter.must!.push({ key: 'source_type', match: { value: options.sourceType as string } });
        }

        const rawResults = await qdrantOps.performTextSearch(
            'documents',
            query,
            filter,
            Math.round(limit * chunkMultiplier)
        );

        const chunks: DocumentTransformedChunk[] = (rawResults || []).map(result => {
            const metadata = result.payload?.metadata as Record<string, unknown> | undefined;
            return {
                id: String(result.id),
                document_id: String(result.payload?.document_id || ''),
                chunk_index: (result.payload?.chunk_index as number) ?? 0,
                chunk_text: String(result.payload?.chunk_text || ''),
                similarity: result.score || 0,
                token_count: (result.payload?.token_count as number) ?? 0,
                created_at: result.payload?.created_at as string | undefined,
                searchMethod: 'text',
                originalVectorScore: null,
                originalTextScore: result.score || 0,
                documents: {
                    id: String(result.payload?.document_id || ''),
                    title: String(result.payload?.title || metadata?.title || 'Untitled'),
                    filename: String(result.payload?.filename || metadata?.filename || ''),
                    created_at: result.payload?.created_at as string | undefined
                }
            };
        });

        if (chunks.length === 0) {
            return {
                success: true,
                results: [],
                query: query.trim(),
                searchType: 'text',
                message: 'No results found'
            };
        }

        const results = await groupAndRank(chunks, limit);

        return {
            success: true,
            results: results as any,
            query: query.trim(),
            searchType: 'text',
            message: `Found ${results.length} relevant document(s) using full-text search`
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
            error: errorMessage
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
    const { embedding, userId, filters, limit, threshold, query, qualityMin } = params;

    if (!qdrantAvailable || !qdrantOps) {
        console.warn('[SearchOperations] Skipping vector search: Qdrant unavailable');
        return [];
    }

    const searchCollection = filters.searchCollection || 'documents';
    console.log(`[SearchOperations] Vector searching collection: ${searchCollection}`);

    const filter: QdrantFilter = { must: [] };

    if (searchCollection === 'documents') {
        filter.must!.push({ key: 'user_id', match: { value: userId as string } });
    }

    if (filters.documentIds && filters.documentIds.length > 0) {
        filter.must!.push({
            key: 'document_id',
            match: { any: filters.documentIds }
        });
    }

    if (filters.sourceType) {
        filter.must!.push({
            key: 'source_type',
            match: { value: filters.sourceType }
        });
    }

    if (filters.titleFilter) {
        filter.must!.push({
            key: 'title',
            match: { value: filters.titleFilter }
        });
    }

    if (filters.additionalFilter?.must) {
        filter.must!.push(...filters.additionalFilter.must);
    }

    if (typeof qualityMin === 'number') {
        filter.must!.push({ key: 'quality_score', range: { gte: qualityMin } });
    }

    let results: QdrantSearchResult[];
    try {
        const intentCfg = vectorConfig.get('retrieval')?.queryIntent;
        if (intentCfg?.enabled) {
            const { queryIntentService } = await import('../QueryIntentService/index.js');
            const intent = queryIntentService.detectIntent(query || '');
            results = await qdrantOps.searchWithIntent(searchCollection, embedding, intent, filter, { limit, threshold, withPayload: true });
        } else {
            results = await qdrantOps.searchWithQuality(searchCollection, embedding, filter, { limit, threshold, withPayload: true });
        }
    } catch (e) {
        const errorMsg = e instanceof Error ? e.message : 'Unknown error';
        console.warn('[SearchOperations] Intent-aware search failed, falling back to quality search:', errorMsg);
        results = await qdrantOps.searchWithQuality(searchCollection, embedding, filter, { limit, threshold, withPayload: true });
    }
    console.log(`[SearchOperations] Qdrant vectorSearch returned ${results.length} hits`);

    return results.map(result => ({
        id: result.id,
        document_id: (result.payload.document_id as string) || (result.payload.url as string),
        chunk_index: result.payload.chunk_index as number,
        chunk_text: result.payload.chunk_text as string,
        similarity: result.score,
        token_count: result.payload.token_count as number | undefined,
        quality_score: (result.payload.quality_score as number) ?? null,
        content_type: (result.payload.content_type as string) ?? null,
        page_number: (result.payload.page_number as number) ?? null,
        created_at: result.payload.created_at as string | undefined,
        url: result.payload.url as string | undefined,
        documents: {
            id: (result.payload.document_id as string) || (result.payload.url as string),
            title: (result.payload.title as string) || (result.payload.metadata?.title as string) || 'Untitled',
            filename: (result.payload.filename as string) || (result.payload.metadata?.filename as string) || '',
            created_at: result.payload.created_at as string | undefined
        }
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

    if (searchCollection === 'documents') {
        filter.must!.push({ key: 'user_id', match: { value: userId as string } });
    }

    if (filters.documentIds && filters.documentIds.length > 0) {
        filter.must!.push({
            key: 'document_id',
            match: { any: filters.documentIds }
        });
    }

    if (filters.sourceType) {
        filter.must!.push({
            key: 'source_type',
            match: { value: filters.sourceType }
        });
    }

    if (filters.titleFilter) {
        filter.must!.push({
            key: 'title',
            match: { value: filters.titleFilter }
        });
    }

    if (filters.additionalFilter?.must) {
        filter.must!.push(...filters.additionalFilter.must);
    }

    console.log('[SearchOperations] Calling Qdrant hybridSearch...');
    const hybridResult = await qdrantOps.hybridSearch(
        searchCollection,
        embedding,
        query,
        filter,
        {
            limit,
            threshold,
            ...hybridOptions
        }
    );
    console.log(`[SearchOperations] Qdrant hybridSearch returned ${hybridResult.results.length} hits`);

    return hybridResult.results.map(result => {
        const metadata = result.payload.metadata as Record<string, unknown> | undefined;
        return {
            id: result.id,
            document_id: (result.payload.document_id as string) || (result.payload.url as string),
            chunk_index: result.payload.chunk_index as number,
            chunk_text: result.payload.chunk_text as string,
            similarity: result.score,
            token_count: result.payload.token_count as number | undefined,
            quality_score: (result.payload.quality_score as number) ?? null,
            content_type: (result.payload.content_type as string) ?? null,
            page_number: (result.payload.page_number as number) ?? null,
            created_at: result.payload.created_at as string | undefined,
            url: result.payload.url as string | undefined,
            searchMethod: result.searchMethod || 'hybrid',
            originalVectorScore: result.originalVectorScore ?? null,
            originalTextScore: result.originalTextScore ?? null,
            documents: {
                id: (result.payload.document_id as string) || (result.payload.url as string),
                title: (result.payload.title as string) || (metadata?.title as string) || 'Untitled',
                filename: (result.payload.filename as string) || (metadata?.filename as string) || '',
                created_at: result.payload.created_at as string | undefined
            }
        };
    });
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
        const {
            section = null,
            limit = 10,
            threshold = 0.3,
            hybridMode = true
        } = options;

        const queryVector = await mistralEmbeddingService.generateEmbedding(query);

        const searchResult = await qdrant.searchBundestagDocuments(queryVector, {
            section,
            limit,
            threshold
        });

        if (!searchResult.success) {
            return {
                success: false,
                results: [],
                error: 'Search failed'
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
                    chunks: []
                });
            }
            const group = urlGroups.get(url)!;
            group.chunks.push({
                text: result.chunk_text as string,
                chunk_index: result.chunk_index as number,
                score: result.score
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
            message: `Found ${groupedResults.length} relevant page(s) from gruene-bundestag.de`
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[SearchOperations] Bundestag search failed:', error);
        return {
            success: false,
            results: [],
            error: errorMessage
        };
    }
}

/**
 * QdrantService Search Functions
 * Extracted search operations for vector similarity search
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { createLogger } from '../../../utils/logger.js';

const logger = createLogger('QdrantService:search');

interface SearchParams {
    vector: number[];
    filter?: QdrantFilter;
    limit: number;
    score_threshold?: number;
    with_payload: boolean;
    params?: {
        ef?: number;
    };
}

interface ScrollParams {
    filter?: QdrantFilter;
    limit: number;
    offset?: number | string | null;
    with_payload: boolean | string[];
    with_vector: boolean;
}

interface CountParams {
    filter?: QdrantFilter;
    exact: boolean;
}

interface QdrantFilter {
    must?: FilterCondition[];
    must_not?: FilterCondition[];
    should?: FilterCondition[];
}

interface FilterCondition {
    key: string;
    match?: { value?: string | number; any?: (string | number)[]; text?: string };
    range?: { gte?: number; lte?: number; gt?: number; lt?: number };
}

interface SearchHit {
    id: string | number;
    score: number;
    payload?: Record<string, unknown>;
    vector?: unknown;
}

interface ScrollResult {
    points: Array<{
        id: string | number;
        payload: Record<string, unknown>;
    }>;
    next_page_offset?: string | number | null;
}

interface CountResult {
    count: number;
}

// Search options interfaces
interface BaseSearchOptions {
    limit?: number;
    threshold?: number;
}

interface DocumentSearchOptions extends BaseSearchOptions {
    userId?: string | null;
    documentIds?: string[] | null;
    collection?: string;
    section?: string | null;
}

interface ContentExampleSearchOptions extends BaseSearchOptions {
    contentType?: string;
    categories?: string[];
    tags?: string[];
}

interface SocialMediaSearchOptions extends BaseSearchOptions {
    platform?: string;
    country?: string;
}

// Search result interfaces
interface SearchResult {
    id: string | number;
    score: number;
    document_id?: string;
    chunk_text?: string;
    chunk_index?: number;
    metadata?: Record<string, unknown>;
    user_id?: string;
    title?: string | null;
    filename?: string | null;
    url?: string | null;
    section?: string | null;
    published_at?: string | null;
}

interface ContentExampleResult {
    id: string;
    score: number;
    title?: string;
    content?: string;
    type?: string;
    categories?: string[];
    tags?: string[];
    description?: string;
    content_data?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    created_at?: string;
    similarity_score?: number;
}

interface SocialMediaResult {
    id: string | number;
    score: number;
    content?: string;
    platform?: string;
    country?: string | null;
    source_account?: string | null;
    created_at?: string;
    _debug_payload?: Record<string, unknown>;
}

interface SearchResponse<T> {
    success: boolean;
    results: T[];
    total: number;
}

// Collection names type
interface Collections {
    documents: string;
    grundsatz_documents: string;
    bundestag_content: string;
    gruene_de_documents: string;
    gruene_at_documents: string;
    content_examples: string;
    social_media_examples: string;
    [key: string]: string;
}

/**
 * Extract content from multiple possible payload fields (legacy data support)
 * @param payload - The payload object to extract content from
 * @returns Extracted content string or undefined
 */
export function extractMultiFieldContent(payload: Record<string, unknown>): string | undefined {
    let content = payload.content as string | undefined;

    const contentData = payload.content_data as Record<string, unknown> | undefined;
    if (!content && contentData?.content) {
        content = contentData.content as string;
    }
    if (!content && contentData?.caption) {
        content = contentData.caption as string;
    }
    if (!content && payload.text) {
        content = payload.text as string;
    }
    if (!content && payload.caption) {
        content = payload.caption as string;
    }

    return content;
}

/**
 * Build filter for content example queries
 * @param options - Content example search options
 * @returns Qdrant filter object or undefined
 */
export function buildContentExampleFilter(options: ContentExampleSearchOptions): QdrantFilter | undefined {
    const filter: QdrantFilter = { must: [] };

    if (options.contentType) {
        filter.must!.push({ key: 'type', match: { value: options.contentType } });
    }
    if (options.categories?.length) {
        filter.must!.push({ key: 'categories', match: { any: options.categories } });
    }
    if (options.tags?.length) {
        filter.must!.push({ key: 'tags', match: { any: options.tags } });
    }

    return filter.must!.length > 0 ? filter : undefined;
}

/**
 * Build filter for social media example queries
 * @param options - Social media search options
 * @returns Qdrant filter object or undefined
 */
export function buildSocialMediaFilter(options: SocialMediaSearchOptions): QdrantFilter | undefined {
    const must: FilterCondition[] = [];

    if (options.platform) {
        must.push({ key: 'platform', match: { value: options.platform } });
    }
    if (options.country) {
        must.push({ key: 'country', match: { value: options.country } });
    }

    return must.length > 0 ? { must } : undefined;
}

/**
 * Build filter for document queries
 * @param options - Document search options
 * @returns Qdrant filter object or undefined
 */
function buildDocumentFilter(options: DocumentSearchOptions): QdrantFilter | undefined {
    const filter: QdrantFilter = { must: [] };

    if (options.userId) {
        filter.must!.push({ key: 'user_id', match: { value: options.userId } });
    }

    if (options.documentIds && options.documentIds.length > 0) {
        filter.must!.push({
            key: 'document_id',
            match: { any: options.documentIds }
        });
    }

    return filter.must!.length > 0 ? filter : undefined;
}

/**
 * Search for similar documents using vector similarity
 * @deprecated Use QdrantService.searchDocuments() or QdrantOperations.searchWithQuality()
 * This function will be removed in the next release.
 * @param client - Qdrant client instance
 * @param collection - Collection name to search in
 * @param queryVector - Query embedding vector
 * @param options - Search options
 * @returns Search results
 */
export async function searchDocuments(
    client: QdrantClient,
    collection: string,
    queryVector: number[],
    options: DocumentSearchOptions = {}
): Promise<SearchResponse<SearchResult>> {
    logger.warn('[DEPRECATED] searchDocuments() in search.ts is deprecated. Use QdrantService.searchDocuments() instead.');
    try {
        const {
            limit = 10,
            threshold = 0.3
        } = options;

        const filter = buildDocumentFilter(options);

        const searchResult = await client.search(collection, {
            vector: queryVector,
            filter: filter,
            limit: limit,
            score_threshold: threshold,
            with_payload: true
        });

        const results: SearchResult[] = searchResult.map((hit) => {
            const payload = hit.payload ?? {};
            return {
                id: hit.id,
                score: hit.score,
                document_id: payload.document_id as string,
                chunk_text: payload.chunk_text as string,
                chunk_index: payload.chunk_index as number,
                metadata: (payload.metadata as Record<string, unknown>) || {},
                user_id: payload.user_id as string
            };
        });

        return {
            success: true,
            results: results,
            total: results.length
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Vector search failed: ${errorMessage}`);
        throw new Error(`Vector search failed: ${errorMessage}`);
    }
}

/**
 * Search grundsatz documents
 * @deprecated Use QdrantService.searchGrundsatzDocuments()
 * This function will be removed in the next release.
 * @param client - Qdrant client instance
 * @param collections - Collections object with collection names
 * @param queryVector - Query embedding vector
 * @param options - Search options
 * @returns Search results
 */
export async function searchGrundsatzDocuments(
    client: QdrantClient,
    collections: Collections,
    queryVector: number[],
    options: DocumentSearchOptions = {}
): Promise<SearchResponse<SearchResult>> {
    logger.warn('[DEPRECATED] searchGrundsatzDocuments() in search.ts is deprecated. Use QdrantService.searchGrundsatzDocuments() instead.');
    return await searchDocuments(client, collections.grundsatz_documents, queryVector, options);
}

/**
 * Search bundestag documents
 * @deprecated Use QdrantService.searchBundestagDocuments()
 * This function will be removed in the next release.
 * @param client - Qdrant client instance
 * @param collections - Collections object with collection names
 * @param queryVector - Query embedding vector
 * @param options - Search options
 * @returns Search results
 */
export async function searchBundestagDocuments(
    client: QdrantClient,
    collections: Collections,
    queryVector: number[],
    options: DocumentSearchOptions = {}
): Promise<SearchResponse<SearchResult>> {
    logger.warn('[DEPRECATED] searchBundestagDocuments() in search.ts is deprecated. Use QdrantService.searchBundestagDocuments() instead.');
    return await searchDocuments(client, collections.bundestag_content, queryVector, options);
}

/**
 * Search gruene.de documents
 * @deprecated Use QdrantService.searchGrueneDeDocuments()
 * This function will be removed in the next release.
 * @param client - Qdrant client instance
 * @param collections - Collections object with collection names
 * @param queryVector - Query embedding vector
 * @param options - Search options
 * @returns Search results
 */
export async function searchGrueneDeDocuments(
    client: QdrantClient,
    collections: Collections,
    queryVector: number[],
    options: DocumentSearchOptions = {}
): Promise<SearchResponse<SearchResult>> {
    logger.warn('[DEPRECATED] searchGrueneDeDocuments() in search.ts is deprecated. Use QdrantService.searchGrueneDeDocuments() instead.');
    return await searchDocuments(client, collections.gruene_de_documents, queryVector, options);
}

/**
 * Search gruene.at documents
 * @deprecated Use QdrantService.searchGrueneAtDocuments()
 * This function will be removed in the next release.
 * @param client - Qdrant client instance
 * @param collections - Collections object with collection names
 * @param queryVector - Query embedding vector
 * @param options - Search options
 * @returns Search results
 */
export async function searchGrueneAtDocuments(
    client: QdrantClient,
    collections: Collections,
    queryVector: number[],
    options: DocumentSearchOptions = {}
): Promise<SearchResponse<SearchResult>> {
    logger.warn('[DEPRECATED] searchGrueneAtDocuments() in search.ts is deprecated. Use QdrantService.searchGrueneAtDocuments() instead.');
    return await searchDocuments(client, collections.gruene_at_documents, queryVector, options);
}

/**
 * Search content examples using vector similarity
 * @deprecated Use QdrantService.searchContentExamples() or QdrantOperations.searchWithQuality()
 * This function will be removed in the next release.
 * @param client - Qdrant client instance
 * @param collection - Collection name
 * @param queryVector - Query embedding vector
 * @param options - Search options including contentType, categories, tags
 * @returns Search results with content examples
 */
export async function searchContentExamples(
    client: QdrantClient,
    collection: string,
    queryVector: number[],
    options: ContentExampleSearchOptions = {}
): Promise<SearchResponse<ContentExampleResult>> {
    logger.warn('[DEPRECATED] searchContentExamples() in search.ts is deprecated. Use QdrantService.searchContentExamples() instead.');
    try {
        const { limit = 10, threshold = 0.3 } = options;
        const filter = buildContentExampleFilter(options);

        const searchResult = await client.search(collection, {
            vector: queryVector,
            filter: filter,
            limit: limit,
            score_threshold: threshold,
            with_payload: true,
            params: {
                ef: Math.max(100, limit * 2)
            }
        });

        const results: ContentExampleResult[] = searchResult.map((hit) => {
            const payload = hit.payload ?? {};
            return {
                id: payload.example_id as string,
                score: hit.score,
                title: payload.title as string | undefined,
                content: payload.content as string | undefined,
                type: payload.type as string | undefined,
                categories: payload.categories as string[] | undefined,
                tags: payload.tags as string[] | undefined,
                description: payload.description as string | undefined,
                content_data: payload.content_data as Record<string, unknown> | undefined,
                metadata: payload.metadata as Record<string, unknown> | undefined,
                created_at: payload.created_at as string | undefined,
                similarity_score: hit.score
            };
        });

        return {
            success: true,
            results: results,
            total: results.length
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Content examples search failed: ${errorMessage}`);
        throw new Error(`Content examples search failed: ${errorMessage}`);
    }
}

/**
 * Search social media examples with platform and country filtering (multitenancy)
 * @deprecated Use QdrantService.searchSocialMediaExamples() or QdrantOperations.searchWithQuality()
 * This function will be removed in the next release.
 * @param client - Qdrant client instance
 * @param collection - Collection name
 * @param queryVector - Query embedding vector
 * @param options - Search options including platform and country
 * @returns Search results with social media examples
 */
export async function searchSocialMediaExamples(
    client: QdrantClient,
    collection: string,
    queryVector: number[],
    options: SocialMediaSearchOptions = {}
): Promise<SearchResponse<SocialMediaResult>> {
    logger.warn('[DEPRECATED] searchSocialMediaExamples() in search.ts is deprecated. Use QdrantService.searchSocialMediaExamples() instead.');
    try {
        const { limit = 10, threshold = 0.3 } = options;
        const filter = buildSocialMediaFilter(options);

        const searchResult = await client.search(collection, {
            vector: queryVector,
            filter: filter,
            limit: limit,
            score_threshold: threshold,
            with_payload: true,
            params: {
                ef: Math.max(100, limit * 2)
            }
        });

        const results: SocialMediaResult[] = searchResult.map((hit) => {
            const payload = hit.payload ?? {};
            return {
                id: (payload.example_id as string | number) || hit.id,
                score: hit.score,
                content: extractMultiFieldContent(payload),
                platform: payload.platform as string | undefined,
                country: (payload.country as string) || null,
                source_account: (payload.source_account as string) || null,
                created_at: payload.created_at as string | undefined,
                _debug_payload: payload
            };
        });

        return {
            success: true,
            results: results,
            total: results.length
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Social media search failed: ${errorMessage}`);
        throw new Error(`Social media search failed: ${errorMessage}`);
    }
}

/**
 * Search Facebook examples (convenience method)
 * @param client - Qdrant client instance
 * @param collection - Collection name
 * @param queryVector - Query embedding vector
 * @param options - Search options including country filter
 * @returns Search results with Facebook examples
 */
export async function searchFacebookExamples(
    client: QdrantClient,
    collection: string,
    queryVector: number[],
    options: Omit<SocialMediaSearchOptions, 'platform'> = {}
): Promise<SearchResponse<SocialMediaResult>> {
    return await searchSocialMediaExamples(client, collection, queryVector, {
        ...options,
        platform: 'facebook'
    });
}

/**
 * Search Instagram examples (convenience method)
 * @param client - Qdrant client instance
 * @param collection - Collection name
 * @param queryVector - Query embedding vector
 * @param options - Search options including country filter
 * @returns Search results with Instagram examples
 */
export async function searchInstagramExamples(
    client: QdrantClient,
    collection: string,
    queryVector: number[],
    options: Omit<SocialMediaSearchOptions, 'platform'> = {}
): Promise<SearchResponse<SocialMediaResult>> {
    return await searchSocialMediaExamples(client, collection, queryVector, {
        ...options,
        platform: 'instagram'
    });
}

// Export types for consumers
export type {
    QdrantFilter,
    FilterCondition,
    SearchHit,
    BaseSearchOptions,
    DocumentSearchOptions,
    ContentExampleSearchOptions,
    SocialMediaSearchOptions,
    SearchResult,
    ContentExampleResult,
    SocialMediaResult,
    SearchResponse,
    Collections
};

// Re-export QdrantClient for convenience
export { QdrantClient };

/**
 * DocumentSearchService - Unified document vector search service
 *
 * Merges vectorSearchService and qdrantDocumentService functionality.
 * Extends BaseSearchService for shared utilities and template methods.
 *
 * Key Responsibilities:
 * - Document vector storage and retrieval
 * - Semantic search using vector embeddings
 * - Hybrid search combining vector and text
 * - Document text reconstruction from chunks
 * - User statistics and management
 */

import { BaseSearchService } from '../../BaseSearchService/index.js';
import { getQdrantInstance } from '../../../database/services/QdrantService.js';
import { QdrantOperations } from '../../../database/services/QdrantOperations.js';
// @ts-ignore - JavaScript module without types
import { InputValidator } from '../../../utils/validation/index.js';
// @ts-ignore - JavaScript module without types
import { vectorConfig } from '../../../config/vectorConfig.js';
// @ts-ignore - JavaScript module without types
import { isSystemQdrantCollection } from '../../../config/systemCollectionsConfig.js';
// @ts-ignore - JavaScript module without types
import { mistralEmbeddingService } from '../../mistral/index.js';

import type {
    DocumentSearchParams,
    DocumentSearchFilters,
    DocumentSearchOptions,
    HybridConfig,
    ChunkWithMetadata,
    VectorMetadata,
    VectorStoreResult,
    SearchUserDocumentsOptions,
    UserDocumentSearchResult,
    DeleteResult,
    UserVectorStats,
    DocumentFullTextResult,
    BulkDocumentResult,
    FirstChunksResult,
    BundestagSearchOptions,
    BundestagSearchResult,
    DocumentRawChunk,
    DocumentChunkData,
    DocumentTransformedChunk,
    DocumentEnhancedScore,
    FindSimilarChunksParams,
    FindHybridChunksParams
} from './types.js';

import type {
    SearchParams,
    SearchResponse,
    HybridMetadata
} from '../../BaseSearchService/types.js';

import type { QdrantService } from '../../../database/services/QdrantService.js';

import * as vectorOps from './vectorOperations.js';
import * as docRetrieval from './documentRetrieval.js';
import * as searchOps from './searchOperations.js';
import * as scoring from './scoring.js';

/**
 * Main DocumentSearchService class
 *
 * Provides comprehensive document search and management functionality
 * with support for vector, text, and hybrid search modes.
 */
// System collection mapping - maps collection IDs to Qdrant collection names
const SYSTEM_COLLECTION_MAP: Record<string, string> = {
    'grundsatz-system': 'grundsatz_documents',
    'bundestagsfraktion-system': 'bundestag_content',
    'gruene-de-system': 'gruene_de_documents',
    'oesterreich-gruene-system': 'oesterreich_gruene_documents',
    'kommunalwiki-system': 'kommunalwiki_documents',
    'gruene-at-system': 'gruene_at_documents',
    'boell-stiftung-system': 'boell_stiftung_documents',
    'satzungen-system': 'satzungen_documents',
    'wahlprogramm': 'wahlprogramm_documents',
    // Fallback shortened names
    'grundsatz': 'grundsatz_documents',
    'bundestag': 'bundestag_content',
    'gruene_de': 'gruene_de_documents'
};

export class DocumentSearchService extends BaseSearchService {
    private qdrant: QdrantService;
    private qdrantOps: QdrantOperations | null;
    private initialized: boolean;
    private qdrantAvailable: boolean;
    private hybridConfig: HybridConfig;

    constructor() {
        super({
            serviceName: 'DocumentSearch',
            defaultLimit: 5,
            defaultThreshold: 0.3
        });

        this.qdrant = getQdrantInstance();
        this.qdrantOps = null;
        this.initialized = false;
        this.qdrantAvailable = false;
        this.hybridConfig = vectorConfig.get('hybrid');
    }

    /**
     * Initialize service and Qdrant operations
     *
     * Ensures Qdrant client is connected and operations are ready.
     * Called automatically before search operations.
     */
    async ensureInitialized(): Promise<void> {
        if (!this.initialized) {
            await this.qdrant.init();
            this.qdrantAvailable = !!this.qdrant?.client && !!this.qdrant?.isConnected;

            if (this.qdrantAvailable) {
                this.qdrantOps = new QdrantOperations(this.qdrant.client);
            } else {
                console.warn('[DocumentSearchService] Qdrant not available; vector searches will be skipped');
                this.qdrantOps = null;
            }
            this.initialized = true;
        }
    }

    /**
     * Validate and normalize search parameters
     *
     * Supports both flat and nested parameter structures for backward compatibility.
     * Handles system collection searches that don't require user ID.
     *
     * @param params - Raw search parameters
     * @returns Validated and normalized parameters
     */
    override validateSearchParams(params: any): DocumentSearchParams {
        if (params && (params.userId || params.filters || params.options)) {
            const query = InputValidator.validateSearchQuery(params.query);
            const searchCollection = params.filters?.searchCollection || params.options?.searchCollection;
            const isSystemSearch = isSystemQdrantCollection(searchCollection);
            const userId = isSystemSearch && (params.userId === null || params.userId === undefined)
                ? null
                : InputValidator.validateUserId(params.userId);

            const documentIds = params.filters?.documentIds || params.options?.documentIds
                ? InputValidator.validateDocumentIds(params.filters?.documentIds || params.options?.documentIds)
                : undefined;
            const sourceType = params.filters?.sourceType;
            const group_id = params.filters?.group_id;
            const titleFilter = params.filters?.titleFilter || params.options?.titleFilter;
            const additionalFilter = params.filters?.additionalFilter || params.options?.additionalFilter;

            const limit = InputValidator.validateNumber(
                params.options?.limit || this.defaultLimit,
                'limit',
                { min: 1, max: 100 }
            );
            const threshold = InputValidator.validateNumber(
                params.options?.threshold,
                'threshold',
                { min: 0, max: 1, allowNull: true }
            );

            const options = {
                limit,
                threshold: threshold ?? this.defaultThreshold,
                useCache: params.options?.useCache !== false,
                vectorWeight: params.options?.vectorWeight,
                textWeight: params.options?.textWeight,
                useRRF: params.options?.useRRF,
                rrfK: params.options?.rrfK,
                qualityMin: typeof params.options?.qualityMin === 'number' ? params.options.qualityMin : undefined
            };

            return {
                query,
                userId,
                filters: { documentIds, sourceType, group_id, searchCollection, titleFilter, additionalFilter },
                options
            };
        }

        const isSystemCollection = params && isSystemQdrantCollection(params.searchCollection);
        if (isSystemCollection && (params.user_id === null || params.user_id === undefined)) {
            const query = InputValidator.validateSearchQuery(params.query);
            const limit = InputValidator.validateNumber(
                params.limit || this.defaultLimit,
                'limit',
                { min: 1, max: 100 }
            );
            const threshold = InputValidator.validateNumber(
                params.threshold,
                'threshold',
                { min: 0, max: 1, allowNull: true }
            );
            let documentIds;
            if (params.documentIds) {
                documentIds = InputValidator.validateDocumentIds(params.documentIds);
            }
            let vectorWeightOpt; let textWeightOpt;
            try {
                if (typeof params.vectorWeight === 'number') {
                    vectorWeightOpt = InputValidator.validateNumber(params.vectorWeight, 'vectorWeight', { min: 0, max: 1 });
                }
                if (typeof params.textWeight === 'number') {
                    textWeightOpt = InputValidator.validateNumber(params.textWeight, 'textWeight', { min: 0, max: 1 });
                }
            } catch (e) {
                // ignore invalid weights
            }
            return {
                query,
                userId: null,
                filters: {
                    documentIds,
                    sourceType: params.sourceType,
                    group_id: params.group_id,
                    searchCollection: params.searchCollection,
                    titleFilter: params.titleFilter,
                    additionalFilter: params.additionalFilter
                },
                options: {
                    limit,
                    threshold: threshold ?? this.defaultThreshold,
                    useCache: true,
                    mode: params.mode,
                    ...(vectorWeightOpt !== undefined ? { vectorWeight: vectorWeightOpt } : {}),
                    ...(textWeightOpt !== undefined ? { textWeight: textWeightOpt } : {}),
                    ...(typeof params.qualityMin === 'number' ? { qualityMin: params.qualityMin } : {}),
                    ...(typeof params.recallLimit === 'number' ? { recallLimit: params.recallLimit } : {})
                }
            };
        }

        const validated = InputValidator.validateSearchParams(params);
        let vectorWeightOpt;
        let textWeightOpt;
        try {
            if (typeof params.vectorWeight === 'number') {
                vectorWeightOpt = InputValidator.validateNumber(params.vectorWeight, 'vectorWeight', { min: 0, max: 1 });
            }
            if (typeof params.textWeight === 'number') {
                textWeightOpt = InputValidator.validateNumber(params.textWeight, 'textWeight', { min: 0, max: 1 });
            }
        } catch (e) {
            // ignore
        }
        return {
            query: validated.query,
            userId: validated.user_id,
            filters: {
                documentIds: validated.documentIds,
                sourceType: validated.sourceType,
                group_id: validated.group_id,
                searchCollection: params.searchCollection,
                titleFilter: params.titleFilter,
                additionalFilter: params.additionalFilter
            },
            options: {
                limit: validated.limit,
                threshold: validated.threshold ?? this.defaultThreshold,
                useCache: true,
                mode: validated.mode,
                ...(vectorWeightOpt !== undefined ? { vectorWeight: vectorWeightOpt } : {}),
                ...(textWeightOpt !== undefined ? { textWeight: textWeightOpt } : {}),
                ...(typeof params.qualityMin === 'number' ? { qualityMin: params.qualityMin } : {}),
                ...(typeof params.recallLimit === 'number' ? { recallLimit: params.recallLimit } : {})
            }
        };
    }

    /**
     * Main search method - implements BaseSearchService template
     *
     * Routes to appropriate search mode based on options:
     * - 'hybrid': Combined vector and text search
     * - 'vector': Semantic similarity search (default)
     * - 'text': Keyword-only search
     *
     * @param searchParams - Search parameters
     * @returns Search response with ranked results
     */
    override async search(searchParams: SearchParams): Promise<SearchResponse> {
        try {
            await this.ensureInitialized();

            const validated = this.validateSearchParams(searchParams);
            const mode = validated.options?.mode || 'vector';

            if (mode === 'hybrid') {
                console.log('[DocumentSearchService] Executing hybrid search mode');
                return await this.performHybridSearch(validated);
            }

            return await this.performSimilaritySearch(validated);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('[DocumentSearchService] Search error:', error);
            return this.createErrorResponse(error as Error, searchParams.query);
        }
    }

    /**
     * Full-text (keyword-only) search over document chunks
     *
     * @param query - Search query
     * @param userId - User ID
     * @param options - Search options
     * @returns Search response
     */
    async textSearch(query: string, userId: string, options: DocumentSearchOptions = {}): Promise<SearchResponse> {
        try {
            await this.ensureInitialized();

            if (!this.qdrantOps) {
                throw new Error('Qdrant not available');
            }

            return await searchOps.performTextSearch(
                this.qdrantOps,
                query,
                userId,
                options,
                this.chunkMultiplier,
                this.groupAndRankHybridResults.bind(this)
            );

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('[DocumentSearchService] Text search error:', error);
            return this.createErrorResponse(error as Error, query);
        }
    }

    /**
     * Hybrid search combining vector similarity with text matching
     *
     * @param query - Search query
     * @param userId - User ID
     * @param options - Search options
     * @returns Search response
     */
    async hybridSearch(query: string, userId: string, options: DocumentSearchOptions = {}): Promise<SearchResponse> {
        try {
            await this.ensureInitialized();

            if (vectorConfig.isVerboseMode()) {
                console.log(`[DocumentSearchService] Hybrid search config - Dynamic thresholds: ${this.hybridConfig.enableDynamicThresholds}, Quality gate: ${this.hybridConfig.enableQualityGate}, Confidence weighting: ${this.hybridConfig.enableConfidenceWeighting}`);
            }

            return await this.performHybridSearch({
                query,
                userId,
                filters: {
                    documentIds: options.documentIds,
                    sourceType: options.sourceType,
                    searchCollection: options.searchCollection
                },
                options: {
                    limit: options.limit || this.defaultLimit,
                    threshold: options.threshold,
                    vectorWeight: options.vectorWeight || 0.7,
                    textWeight: options.textWeight || 0.3,
                    useRRF: options.useRRF !== false,
                    rrfK: options.rrfK || 60,
                    useCache: true,
                    hybridConfig: this.hybridConfig
                }
            });

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('[DocumentSearchService] Hybrid search error:', error);
            return this.createErrorResponse(error as Error, query);
        }
    }

    // ========== Vector Storage Operations ==========

    async storeDocumentVectors(
        userId: string,
        documentId: string,
        chunks: ChunkWithMetadata[],
        embeddings: number[][],
        metadata: VectorMetadata = {}
    ): Promise<VectorStoreResult> {
        await this.ensureInitialized();
        if (!this.qdrantOps) {
            throw new Error('Qdrant not available');
        }
        return await vectorOps.storeDocumentVectors(this.qdrantOps, userId, documentId, chunks, embeddings, metadata);
    }

    async searchUserDocuments(
        userId: string,
        queryVector: number[],
        options: SearchUserDocumentsOptions = {}
    ): Promise<UserDocumentSearchResult> {
        await this.ensureInitialized();
        if (!this.qdrantOps) {
            throw new Error('Qdrant not available');
        }
        return await vectorOps.searchUserDocuments(this.qdrantOps, userId, queryVector, options);
    }

    async deleteDocumentVectors(documentId: string, userId: string | null = null): Promise<DeleteResult> {
        await this.ensureInitialized();
        if (!this.qdrantOps) {
            throw new Error('Qdrant not available');
        }
        return await vectorOps.deleteDocumentVectors(this.qdrantOps, documentId, userId);
    }

    async deleteUserDocuments(userId: string): Promise<DeleteResult> {
        await this.ensureInitialized();
        if (!this.qdrantOps) {
            throw new Error('Qdrant not available');
        }
        return await vectorOps.deleteUserDocuments(this.qdrantOps, userId);
    }

    async getUserVectorStats(userId: string): Promise<UserVectorStats> {
        await this.ensureInitialized();
        if (!this.qdrantOps) {
            throw new Error('Qdrant not available');
        }
        return await vectorOps.getUserVectorStats(this.qdrantOps, userId);
    }

    // ========== Document Text Retrieval ==========

    async getDocumentFullText(userId: string, documentId: string): Promise<DocumentFullTextResult> {
        await this.ensureInitialized();
        if (!this.qdrantOps) {
            throw new Error('Qdrant not available');
        }
        return await docRetrieval.getDocumentFullText(this.qdrantOps, userId, documentId);
    }

    async getMultipleDocumentsFullText(userId: string, documentIds: string[]): Promise<BulkDocumentResult> {
        await this.ensureInitialized();
        if (!this.qdrantOps) {
            throw new Error('Qdrant not available');
        }
        return await docRetrieval.getMultipleDocumentsFullText(this.qdrantOps, userId, documentIds);
    }

    async getDocumentFirstChunks(userId: string, documentIds: string[]): Promise<FirstChunksResult> {
        await this.ensureInitialized();
        if (!this.qdrantOps) {
            throw new Error('Qdrant not available');
        }
        return await docRetrieval.getDocumentFirstChunks(this.qdrantOps, userId, documentIds);
    }

    /**
     * Get a chunk with surrounding context for citation display
     *
     * @param userId - User ID
     * @param documentId - Document ID
     * @param chunkIndex - Target chunk index
     * @param options - Context options (window size)
     * @returns Context chunks with center chunk highlighted
     */
    async getChunkWithContext(
        userId: string,
        documentId: string,
        chunkIndex: number,
        options: { window?: number } = {}
    ): Promise<{
        success: boolean;
        centerChunk?: { text: string; chunkIndex: number };
        contextChunks?: Array<{ text: string; chunkIndex: number; isCenter: boolean }>;
        error?: string;
    }> {
        await this.ensureInitialized();
        if (!this.qdrantOps) {
            return { success: false, error: 'Qdrant not available' };
        }

        const collectionName = `user_${userId}_documents`;
        const windowSize = options.window ?? 2;

        try {
            // First, find the point by document_id and chunk_index
            const filter = {
                must: [
                    { key: 'document_id', match: { value: documentId } },
                    { key: 'chunk_index', match: { value: chunkIndex } }
                ]
            };

            const scrollResult = await this.qdrantOps.scrollDocuments(collectionName, filter, {
                limit: 1,
                withPayload: true
            });

            if (!scrollResult || scrollResult.length === 0) {
                return { success: false, error: 'Chunk not found' };
            }

            const centerPoint = scrollResult[0];

            // Get context using existing method
            const contextResult = await this.qdrantOps.getChunkWithContext(
                collectionName,
                { id: centerPoint.id, payload: centerPoint.payload },
                { window: windowSize }
            );

            if (!contextResult.center) {
                return { success: false, error: 'Failed to retrieve context' };
            }

            // Format the response
            const centerChunk = {
                text: (contextResult.center.payload.chunk_text as string) || '',
                chunkIndex: (contextResult.center.payload.chunk_index as number) ?? chunkIndex
            };

            const contextChunks = contextResult.context.map(chunk => ({
                text: (chunk.payload.chunk_text as string) || '',
                chunkIndex: (chunk.payload.chunk_index as number) ?? 0,
                isCenter: chunk.id === contextResult.center?.id
            }));

            return {
                success: true,
                centerChunk,
                contextChunks
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[DocumentSearchService] getChunkWithContext error: ${message}`);
            return { success: false, error: message };
        }
    }

    /**
     * Get a chunk with surrounding context for system documents (grundsatz, bundestag, etc.)
     *
     * @param collectionType - Collection type: 'grundsatz', 'bundestag', 'gruene_de', etc.
     * @param documentId - Document ID or title in the collection
     * @param chunkIndex - Target chunk index
     * @param options - Context options (window size)
     * @returns Context chunks with center chunk highlighted
     */
    async getSystemChunkWithContext(
        collectionType: string,
        documentId: string,
        chunkIndex: number,
        options: { window?: number } = {}
    ): Promise<{
        success: boolean;
        centerChunk?: { text: string; chunkIndex: number };
        contextChunks?: Array<{ text: string; chunkIndex: number; isCenter: boolean }>;
        error?: string;
    }> {
        await this.ensureInitialized();
        if (!this.qdrantOps) {
            return { success: false, error: 'Qdrant not available' };
        }

        const collectionName = SYSTEM_COLLECTION_MAP[collectionType] || `${collectionType}_documents`;
        const windowSize = options.window ?? 2;

        try {
            // Find the point by document_id (or title for some collections) and chunk_index
            const filter = {
                must: [
                    { key: 'document_id', match: { value: documentId } },
                    { key: 'chunk_index', match: { value: chunkIndex } }
                ]
            };

            let scrollResult = await this.qdrantOps.scrollDocuments(collectionName, filter, {
                limit: 1,
                withPayload: true
            });

            // If not found by document_id, try with title field
            if (!scrollResult || scrollResult.length === 0) {
                const titleFilter = {
                    must: [
                        { key: 'title', match: { value: documentId } },
                        { key: 'chunk_index', match: { value: chunkIndex } }
                    ]
                };

                scrollResult = await this.qdrantOps.scrollDocuments(collectionName, titleFilter, {
                    limit: 1,
                    withPayload: true
                });

                if (!scrollResult || scrollResult.length === 0) {
                    return { success: false, error: 'Chunk not found in collection' };
                }
            }

            const centerPoint = scrollResult[0];

            // Get context using existing method
            const contextResult = await this.qdrantOps.getChunkWithContext(
                collectionName,
                { id: centerPoint.id, payload: centerPoint.payload },
                { window: windowSize }
            );

            if (!contextResult.center) {
                return { success: false, error: 'Failed to retrieve context' };
            }

            const centerChunk = {
                text: (contextResult.center.payload.chunk_text as string) || '',
                chunkIndex: (contextResult.center.payload.chunk_index as number) ?? chunkIndex
            };

            const contextChunks = contextResult.context.map(chunk => ({
                text: (chunk.payload.chunk_text as string) || '',
                chunkIndex: (chunk.payload.chunk_index as number) ?? 0,
                isCenter: chunk.id === contextResult.center?.id
            }));

            return {
                success: true,
                centerChunk,
                contextChunks
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[DocumentSearchService] getSystemChunkWithContext error: ${message}`);
            return { success: false, error: message };
        }
    }

    /**
     * Detect which system collection contains a document by ID
     * Scans known system collections to find where the document exists
     */
    async detectSystemCollectionForDocument(documentId: string): Promise<string> {
        await this.ensureInitialized();
        if (!this.qdrantOps) {
            return 'user';
        }

        // Get unique collection names from the map (filter out shorthand duplicates)
        const seenCollections = new Set<string>();
        const systemCollections: Array<{ type: string; collection: string }> = [];
        for (const [type, collection] of Object.entries(SYSTEM_COLLECTION_MAP)) {
            if (!seenCollections.has(collection)) {
                seenCollections.add(collection);
                systemCollections.push({ type, collection });
            }
        }

        for (const { type, collection } of systemCollections) {
            try {
                const filter = {
                    should: [
                        { key: 'document_id', match: { value: documentId } },
                        { key: 'title', match: { value: documentId } }
                    ]
                };

                const result = await this.qdrantOps.scrollDocuments(collection, filter, {
                    limit: 1,
                    withPayload: false
                });

                if (result && result.length > 0) {
                    console.log(`[DocumentSearchService] Found document '${documentId}' in collection '${collection}'`);
                    return type;
                }
            } catch {
                // Collection might not exist, continue to next
            }
        }

        return 'user';
    }

    // ========== Bundestag Search ==========

    async searchBundestagContent(query: string, options: BundestagSearchOptions = {}): Promise<BundestagSearchResult> {
        await this.ensureInitialized();
        return await searchOps.searchBundestagContent(this.qdrant, mistralEmbeddingService, query, options);
    }

    // ========== BaseSearchService Abstract Method Implementations ==========

    override async findSimilarChunks(params: FindSimilarChunksParams): Promise<DocumentTransformedChunk[]> {
        return await searchOps.findSimilarChunks(this.qdrantOps, this.qdrantAvailable, params);
    }

    override async findHybridChunks(params: FindHybridChunksParams): Promise<DocumentTransformedChunk[]> {
        return await searchOps.findHybridChunks(this.qdrantOps, this.qdrantAvailable, params);
    }

    override extractChunkData(chunk: DocumentRawChunk): DocumentChunkData {
        return scoring.extractChunkData(chunk);
    }

    calculateEnhancedDocumentScore(chunks: DocumentChunkData[]): DocumentEnhancedScore {
        return scoring.calculateEnhancedDocumentScore(chunks);
    }

    calculateHybridDocumentScore(chunks: DocumentChunkData[], hybridMetadata?: HybridMetadata): DocumentEnhancedScore {
        return scoring.calculateHybridDocumentScore(chunks, hybridMetadata);
    }

    override buildRelevanceInfo(doc: any, enhancedScore: DocumentEnhancedScore): string {
        return scoring.buildRelevanceInfo(doc, enhancedScore);
    }

    override getSearchType(): string {
        return 'document_vector';
    }

    // ========== Legacy Methods for Backward Compatibility ==========

    async searchDocuments(query: string, userId: string, options: any = {}): Promise<SearchResponse> {
        return await this.search({
            query,
            userId: userId,
            filters: {
                documentIds: options.documentIds
            },
            options: {
                limit: options.limit || 5,
                threshold: options.threshold
            }
        });
    }

    async getDocumentStats(userId: string): Promise<UserVectorStats> {
        return await this.getUserVectorStats(userId);
    }

    async isReady(): Promise<boolean> {
        try {
            await this.ensureInitialized();
            if (!this.qdrantOps) {
                return false;
            }
            return await this.qdrantOps.healthCheck();
        } catch (error) {
            console.error('[DocumentSearchService] Service not ready:', error);
            return false;
        }
    }
}

/**
 * Export service factory function for dependency injection
 */
export function getQdrantDocumentService(): DocumentSearchService {
    return new DocumentSearchService();
}

/**
 * DocumentSearchService - Unified document vector search service
 * Merges vectorSearchService and qdrantDocumentService functionality
 * Extends BaseSearchService for shared utilities
 */

import { fastEmbedService } from './FastEmbedService.js';
import { getQdrantInstance } from '../database/services/QdrantService.js';
import { QdrantOperations } from '../database/services/QdrantOperations.js';
import { BaseSearchService } from './BaseSearchService.js';
import { InputValidator } from '../utils/inputValidation.js';
import { vectorConfig } from '../config/vectorConfig.js';
import { v4 as uuidv4 } from 'uuid';

class DocumentSearchService extends BaseSearchService {
    constructor() {
        super({
            serviceName: 'DocumentSearch',
            defaultLimit: 5,
            defaultThreshold: 0.3
        });
        
        this.qdrant = getQdrantInstance();
        this.qdrantOps = null; // Initialize after Qdrant is ready
        this.initialized = false;
        this.qdrantAvailable = false;
        this.hybridConfig = vectorConfig.get('hybrid');
    }

    /**
     * Full-text (keyword-only) search over document chunks
     * Uses Qdrant text index and aggregates results per document
     */
    async textSearch(query, userId, options = {}) {
        try {
            await this.ensureInitialized();

            const limit = options.limit || this.defaultLimit;

            // Build filter for user and optional documentIds/sourceType
            const filter = { must: [{ key: 'user_id', match: { value: userId } }] };

            if (options.documentIds && Array.isArray(options.documentIds) && options.documentIds.length > 0) {
                filter.must.push({ key: 'document_id', match: { any: options.documentIds } });
            }

            if (options.sourceType) {
                filter.must.push({ key: 'source_type', match: { value: options.sourceType } });
            }

            // Run text search via Qdrant
            const rawResults = await this.qdrantOps.performTextSearch(
                'documents',
                query,
                filter,
                Math.round(limit * this.chunkMultiplier)
            );

            // Map to chunk-like objects compatible with hybrid grouping
            const chunks = (rawResults || []).map(result => ({
                id: result.id,
                document_id: result.payload?.document_id,
                chunk_index: result.payload?.chunk_index ?? 0,
                chunk_text: result.payload?.chunk_text || '',
                similarity: result.score || 0,
                token_count: result.payload?.token_count ?? 0,
                created_at: result.payload?.created_at,
                searchMethod: 'text',
                originalVectorScore: null,
                originalTextScore: result.score || 0,
                documents: {
                    id: result.payload?.document_id,
                    title: result.payload?.title || 'Untitled',
                    filename: result.payload?.filename || '',
                    created_at: result.payload?.created_at
                }
            }));

            if (chunks.length === 0) {
                return {
                    success: true,
                    results: [],
                    query: query.trim(),
                    searchType: 'text',
                    message: 'No results found'
                };
            }

            // Aggregate per document with enhanced scoring
            const results = await this.groupAndRankHybridResults(chunks, limit);

            return {
                success: true,
                results,
                query: query.trim(),
                searchType: 'text',
                message: `Found ${results.length} relevant document(s) using full-text search`
            };

        } catch (error) {
            console.error('[DocumentSearchService] Text search error:', error);
            return this.createErrorResponse(error, query);
        }
    }

    /**
     * Initialize service and Qdrant operations
     */
    async ensureInitialized() {
        if (!this.initialized) {
            await this.qdrant.init();
            this.qdrantAvailable = !!this.qdrant?.client && !!this.qdrant?.isConnected;

            if (this.qdrantAvailable) {
                this.qdrantOps = new QdrantOperations(this.qdrant.client);
            } else {
                // Provide a clear log so callers know vector search is disabled
                console.warn('[DocumentSearchService] Qdrant not available; vector searches will be skipped');
                this.qdrantOps = null;
            }
            this.initialized = true;
        }
    }

    /**
     * Override validateSearchParams to support both flat and nested inputs.
     * - Flat: { query, user_id, limit, threshold, mode, documentIds, group_id }
     * - Nested: { query, userId, filters: { documentIds, sourceType }, options: { ... } }
     */
    validateSearchParams(params) {
        // Nested shape (from performSimilarity/Hybrid invocations)
        if (params && (params.userId || params.filters || params.options)) {
            const query = InputValidator.validateSearchQuery(params.query);
            const isGrundsatz = params.filters?.searchCollection === 'grundsatz_documents';
            const isBundestagContent = params.filters?.searchCollection === 'bundestag_content';
            // Allow null userId for system searches (grundsatz or bundestag_content)
            const userId = (isGrundsatz || isBundestagContent) && (params.userId === null || params.userId === undefined)
                ? null
                : InputValidator.validateUserId(params.userId);

            // Extract and validate optional filters
            const documentIds = params.filters?.documentIds
                ? InputValidator.validateDocumentIds(params.filters.documentIds)
                : undefined;
            const sourceType = params.filters?.sourceType;
            const group_id = params.filters?.group_id;
            const searchCollection = params.filters?.searchCollection;
            const titleFilter = params.filters?.titleFilter;

            // Extract and validate options
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
                threshold,
                vectorWeight: params.options?.vectorWeight,
                textWeight: params.options?.textWeight,
                useRRF: params.options?.useRRF,
                rrfK: params.options?.rrfK,
                useCache: params.options?.useCache !== false,
                qualityMin: typeof params.options?.qualityMin === 'number' ? params.options.qualityMin : undefined
            };

            return {
                query,
                userId,
                filters: { documentIds, sourceType, group_id, searchCollection, titleFilter },
                options
            };
        }

        // Flat shape (direct external calls)
        // Special-case: allow null user_id when searching system collections (grundsatz or bundestag)
        const isSystemCollection = params && (params.searchCollection === 'grundsatz_documents' || params.searchCollection === 'bundestag_content');
        if (isSystemCollection && (params.user_id === null || params.user_id === undefined)) {
            const query = InputValidator.validateSearchQuery(params.query);
            // Optional fields
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
                // ignore invalid weights and fall back to defaults
            }
            return {
                query,
                userId: null,
                filters: {
                    documentIds,
                    sourceType: params.sourceType,
                    group_id: params.group_id,
                    searchCollection: params.searchCollection,
                    titleFilter: params.titleFilter
                },
                options: {
                    limit,
                    threshold,
                    mode: params.mode,
                    useCache: true,
                    ...(vectorWeightOpt !== undefined ? { vectorWeight: vectorWeightOpt } : {}),
                    ...(textWeightOpt !== undefined ? { textWeight: textWeightOpt } : {}),
                    ...(typeof params.qualityMin === 'number' ? { qualityMin: params.qualityMin } : {}),
                    ...(typeof params.recallLimit === 'number' ? { recallLimit: params.recallLimit } : {})
                }
            };
        }

        // Default flat validation via InputValidator
        const validated = InputValidator.validateSearchParams(params);
        // Optional hybrid weights passthrough for flat shape
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
            // If invalid, ignore and fall back to defaults
        }
        return {
            query: validated.query,
            userId: validated.user_id,
            filters: {
                documentIds: validated.documentIds,
                sourceType: validated.sourceType,
                group_id: validated.group_id,
                searchCollection: params.searchCollection,
                titleFilter: params.titleFilter
            },
            options: {
                limit: validated.limit,
                threshold: validated.threshold,
                mode: validated.mode,
                useCache: true,
                ...(vectorWeightOpt !== undefined ? { vectorWeight: vectorWeightOpt } : {}),
                ...(textWeightOpt !== undefined ? { textWeight: textWeightOpt } : {}),
                ...(typeof params.qualityMin === 'number' ? { qualityMin: params.qualityMin } : {}),
                ...(typeof params.recallLimit === 'number' ? { recallLimit: params.recallLimit } : {})
            }
        };
    }

    /**
     * Main search method - implements BaseSearchService template
     */
    async search(searchParams) {
        try {
            await this.ensureInitialized();

            // Normalize and validate params to inspect mode
            const validated = this.validateSearchParams(searchParams);
            const mode = validated.options?.mode || 'vector';

            if (mode === 'hybrid') {
                console.log('[DocumentSearchService] Executing hybrid search mode');
                return await this.performHybridSearch(validated);
            }

            // Default: vector similarity search
            return await this.performSimilaritySearch(validated);

        } catch (error) {
            console.error('[DocumentSearchService] Search error:', error);
            return this.createErrorResponse(error, searchParams.query);
        }
    }

    /**
     * Hybrid search combining vector similarity with text matching
     */
    async hybridSearch(query, userId, options = {}) {
        try {
            await this.ensureInitialized();

            // Log hybrid configuration status
            if (vectorConfig.isVerboseMode()) {
                console.log(`[DocumentSearchService] Hybrid search config - Dynamic thresholds: ${this.hybridConfig.enableDynamicThresholds}, Quality gate: ${this.hybridConfig.enableQualityGate}, Confidence weighting: ${this.hybridConfig.enableConfidenceWeighting}`);
            }

            // Use parent's performHybridSearch for consistency
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
                    // Pass hybrid-specific metadata for enhanced search
                    hybridConfig: this.hybridConfig
                }
            });

        } catch (error) {
            console.error('[DocumentSearchService] Hybrid search error:', error);
            return this.createErrorResponse(error, query);
        }
    }

    /**
     * Store document vectors in Qdrant (from qdrantDocumentService)
     */
    async storeDocumentVectors(userId, documentId, chunks, embeddings, metadata = {}) {
        try {
            await this.ensureInitialized();

            if (chunks.length !== embeddings.length) {
                throw new Error('Number of chunks and embeddings must match');
            }

            const points = chunks.map((chunk, index) => ({
                id: uuidv4(),
                vector: embeddings[index],
                payload: {
                    user_id: userId,
                    document_id: documentId,
                    chunk_index: index,
                    chunk_text: chunk.text,
                    token_count: chunk.tokens || 0,
                    source_type: metadata.sourceType || 'manual',
                    wolke_share_link_id: metadata.wolkeShareLinkId || null,
                    wolke_file_path: metadata.wolkeFilePath || null,
                    title: metadata.title || null,
                    filename: metadata.filename || null,
                    created_at: new Date().toISOString(),
                    ...metadata.additionalPayload
                }
            }));

            const BATCH_SIZE = 20;
            let totalUpserted = 0;

            for (let i = 0; i < points.length; i += BATCH_SIZE) {
                const batch = points.slice(i, i + BATCH_SIZE);
                await this.qdrantOps.batchUpsert('documents', batch, { wait: true });
                totalUpserted += batch.length;
                console.log(`[DocumentSearchService] Upserted batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(points.length / BATCH_SIZE)} (${batch.length} vectors)`);
            }

            console.log(`[DocumentSearchService] Stored ${totalUpserted} vectors for document ${documentId}`);
            return {
                success: true,
                vectorsStored: totalUpserted,
                collectionName: 'documents'
            };

        } catch (error) {
            console.error('[DocumentSearchService] Error storing document vectors:', error);
            throw new Error(`Failed to store document vectors: ${error.message}`);
        }
    }

    /**
     * Search user documents with enhanced filtering
     */
    async searchUserDocuments(userId, queryVector, options = {}) {
        try {
            await this.ensureInitialized();
            
            const {
                limit = 10,
                scoreThreshold = 0.5,
                sourceType = null,
                includePayload = true,
                hybridMode = false,
                query = null,
                hybridOptions = {}
            } = options;
            
            // Build filter for user and optional source type
            const filter = { must: [{ key: 'user_id', match: { value: userId } }] };
            
            if (sourceType) {
                filter.must.push({ key: 'source_type', match: { value: sourceType } });
            }
            
            let searchResult;
            
            if (hybridMode && query) {
                console.log(`[DocumentSearchService] Performing hybrid search for user ${userId}`);
                
                searchResult = await this.qdrantOps.hybridSearch(
                    'documents',
                    queryVector,
                    query,
                    filter,
                    {
                        limit,
                        threshold: scoreThreshold,
                        ...hybridOptions
                    }
                );
            } else {
                console.log(`[DocumentSearchService] Performing vector search for user ${userId}`);
                
                const results = await this.qdrantOps.vectorSearch(
                    'documents',
                    queryVector,
                    filter,
                    {
                        limit,
                        threshold: scoreThreshold,
                        withPayload: includePayload
                    }
                );
                
                searchResult = {
                    success: true,
                    results,
                    metadata: {
                        searchType: 'vector',
                        resultsCount: results.length
                    }
                };
            }
            
            return {
                success: true,
                results: searchResult.results || [],
                metadata: searchResult.metadata,
                query: {
                    userId,
                    limit,
                    scoreThreshold,
                    sourceType,
                    hybridMode
                }
            };

        } catch (error) {
            console.error('[DocumentSearchService] User document search failed:', error);
            return {
                success: false,
                error: error.message,
                results: []
            };
        }
    }

    /**
     * Delete all vectors for a document
     */
    async deleteDocumentVectors(documentId, userId = null) {
        try {
            await this.ensureInitialized();
            
            const filter = { must: [{ key: 'document_id', match: { value: documentId } }] };
            
            // Add user filter if provided for security
            if (userId) {
                filter.must.push({ key: 'user_id', match: { value: userId } });
            }
            
            await this.qdrantOps.batchDelete('documents', filter);
            
            console.log(`[DocumentSearchService] Deleted vectors for document ${documentId}`);
            return { success: true, documentId };

        } catch (error) {
            console.error('[DocumentSearchService] Failed to delete document vectors:', error);
            throw new Error(`Failed to delete document vectors: ${error.message}`);
        }
    }

    /**
     * Delete all vectors for a user
     */
    async deleteUserDocuments(userId) {
        try {
            await this.ensureInitialized();
            
            const filter = { must: [{ key: 'user_id', match: { value: userId } }] };
            await this.qdrantOps.batchDelete('documents', filter);
            
            console.log(`[DocumentSearchService] Deleted all vectors for user ${userId}`);
            return { success: true, userId };

        } catch (error) {
            console.error('[DocumentSearchService] Failed to delete user documents:', error);
            throw new Error(`Failed to delete user documents: ${error.message}`);
        }
    }

    /**
     * Get user's document statistics
     */
    async getUserVectorStats(userId) {
        try {
            await this.ensureInitialized();
            
            const filter = { must: [{ key: 'user_id', match: { value: userId } }] };
            
            // Get all user documents to calculate stats
            const documents = await this.qdrantOps.scrollDocuments('documents', filter, { 
                limit: 1000, 
                withPayload: true, 
                withVector: false 
            });
            
            // Calculate statistics
            const uniqueDocuments = new Set();
            let manualVectors = 0;
            let wolkeVectors = 0;
            
            documents.forEach(doc => {
                uniqueDocuments.add(doc.payload.document_id);
                
                if (doc.payload.source_type === 'manual') {
                    manualVectors++;
                } else if (doc.payload.source_type === 'wolke') {
                    wolkeVectors++;
                }
            });
            
            return {
                uniqueDocuments: uniqueDocuments.size,
                totalVectors: documents.length,
                manualVectors,
                wolkeVectors
            };

        } catch (error) {
            console.error('[DocumentSearchService] Failed to get user stats:', error);
            return {
                uniqueDocuments: 0,
                totalVectors: 0,
                manualVectors: 0,
                wolkeVectors: 0
            };
        }
    }

    // ========== BaseSearchService Abstract Method Implementations ==========

    /**
     * Find similar chunks using QdrantOperations
     */
    async findSimilarChunks(params) {
        const { embedding, userId, filters, limit, threshold, query, qualityMin } = params;

        if (!this.qdrantAvailable || !this.qdrantOps) {
            console.warn('[DocumentSearchService] Skipping vector search: Qdrant unavailable');
            return [];
        }
        
        // Determine which collection to search
        const searchCollection = filters.searchCollection || 'documents';
        console.log(`[DocumentSearchService] Vector searching collection: ${searchCollection}`);
        
        // Build Qdrant filter
        const filter = { must: [] };
        
        // For regular documents collection, filter by user_id
        // For system collections like grundsatz_documents, skip user_id filter
        if (searchCollection === 'documents') {
            filter.must.push({ key: 'user_id', match: { value: userId } });
        }
        
        if (filters.documentIds && filters.documentIds.length > 0) {
            filter.must.push({
                key: 'document_id',
                match: { any: filters.documentIds }
            });
        }
        
        if (filters.sourceType) {
            filter.must.push({
                key: 'source_type',
                match: { value: filters.sourceType }
            });
        }

        if (filters.titleFilter) {
            filter.must.push({
                key: 'title',
                match: { value: filters.titleFilter }
            });
        }
        // Optional quality_min range gating
        if (typeof qualityMin === 'number') {
            filter.must.push({ key: 'quality_score', range: { gte: qualityMin } });
        }

        // If intent detection is enabled, generate intent-based preferences
        let results;
        try {
            const intentCfg = vectorConfig.get('retrieval')?.queryIntent;
            if (intentCfg?.enabled) {
                const { queryIntentService } = await import('./QueryIntentService.js');
                const intent = queryIntentService.detectIntent(query || '');
                // Prefer quality-aware search with intent filter
                results = await this.qdrantOps.searchWithIntent(searchCollection, embedding, intent, filter, { limit, threshold, withPayload: true });
            } else {
                results = await this.qdrantOps.searchWithQuality(searchCollection, embedding, filter, { limit, threshold, withPayload: true });
            }
        } catch (e) {
            console.warn('[DocumentSearchService] Intent-aware search failed, falling back to quality search:', e.message);
            results = await this.qdrantOps.searchWithQuality(searchCollection, embedding, filter, { limit, threshold, withPayload: true });
        }
        console.log(`[DocumentSearchService] Qdrant vectorSearch returned ${results.length} hits`);
        
        // Transform to expected format for BaseSearchService
        // Use url as fallback for document_id (for bundestag_content collection)
        return results.map(result => ({
            id: result.id,
            document_id: result.payload.document_id || result.payload.url,
            chunk_index: result.payload.chunk_index,
            chunk_text: result.payload.chunk_text,
            similarity: result.score,
            token_count: result.payload.token_count,
            quality_score: result.payload.quality_score ?? null,
            content_type: result.payload.content_type ?? null,
            page_number: result.payload.page_number ?? null,
            created_at: result.payload.created_at,
            url: result.payload.url,
            documents: {
                id: result.payload.document_id || result.payload.url,
                title: result.payload.title || 'Untitled',
                filename: result.payload.filename || '',
                created_at: result.payload.created_at
            }
        }));
    }

    /**
     * Find hybrid chunks using QdrantOperations
     */
    async findHybridChunks(params) {
        const { embedding, query, userId, filters, limit, threshold, hybridOptions } = params;
        if (!this.qdrantAvailable || !this.qdrantOps) {
            console.warn('[DocumentSearchService] Skipping hybrid search: Qdrant unavailable');
            return [];
        }
        
        // Determine which collection to search
        const searchCollection = filters.searchCollection || 'documents';
        console.log(`[DocumentSearchService] Searching collection: ${searchCollection}`);
        
        // Build Qdrant filter
        const filter = { must: [] };
        
        // For regular documents collection, filter by user_id
        // For system collections like grundsatz_documents, skip user_id filter
        if (searchCollection === 'documents') {
            filter.must.push({ key: 'user_id', match: { value: userId } });
        }
        
        if (filters.documentIds && filters.documentIds.length > 0) {
            filter.must.push({
                key: 'document_id',
                match: { any: filters.documentIds }
            });
        }
        
        if (filters.sourceType) {
            filter.must.push({
                key: 'source_type',
                match: { value: filters.sourceType }
            });
        }

        if (filters.titleFilter) {
            filter.must.push({
                key: 'title',
                match: { value: filters.titleFilter }
            });
        }

        console.log('[DocumentSearchService] Calling Qdrant hybridSearch...');
        const hybridResult = await this.qdrantOps.hybridSearch(
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
        console.log(`[DocumentSearchService] Qdrant hybridSearch returned ${hybridResult.results.length} hits`);

        // Transform to expected format with hybrid metadata
        // Use url as fallback for document_id (for bundestag_content collection)
        return hybridResult.results.map(result => ({
            id: result.id,
            document_id: result.payload.document_id || result.payload.url,
            chunk_index: result.payload.chunk_index,
            chunk_text: result.payload.chunk_text,
            similarity: result.score,
            token_count: result.payload.token_count,
            quality_score: result.payload.quality_score ?? null,
            content_type: result.payload.content_type ?? null,
            page_number: result.payload.page_number ?? null,
            created_at: result.payload.created_at,
            url: result.payload.url,
            searchMethod: result.searchMethod || 'hybrid',
            originalVectorScore: result.originalVectorScore,
            originalTextScore: result.originalTextScore,
            documents: {
                id: result.payload.document_id || result.payload.url,
                title: result.payload.title || 'Untitled',
                filename: result.payload.filename || '',
                created_at: result.payload.created_at
            }
        }));
    }

    /**
     * Include quality metadata in chunk extraction
     */
    extractChunkData(chunk) {
        const base = super.extractChunkData(chunk);
        return {
            ...base,
            quality_score: chunk.quality_score ?? null,
            content_type: chunk.content_type ?? null,
            page_number: chunk.page_number ?? null
        };
    }

  /**
   * Apply quality-weighted adjustment to document score
   */
  calculateEnhancedDocumentScore(chunks) {
        const base = this._computeSafeBaseScore(chunks);
        // Compute average quality from available chunk metadata
        const qualities = chunks.map(c => typeof c.quality_score === 'number' ? c.quality_score : 1.0);
        const avgQ = qualities.length ? (qualities.reduce((a, b) => a + b, 0) / qualities.length) : 1.0;
        const qCfg = vectorConfig.get('quality')?.retrieval || {};
        const boost = qCfg.qualityBoostFactor ?? 1.2;
        const factor = 1 + ((avgQ - 0.5) * (boost - 1));
        return {
            ...base,
            finalScore: Math.min(1.0, base.finalScore * factor),
            qualityAvg: avgQ
        };
  }

    /**
     * Apply quality-weighted adjustment in hybrid mode as well
     */
  calculateHybridDocumentScore(chunks, hybridMetadata) {
        // Start from a safe base score, then add hybrid bonus if both signals present
        const baseSimple = this._computeSafeBaseScore(chunks);
        const bothSignals = hybridMetadata?.hasVectorMatch && hybridMetadata?.hasTextMatch;
        const hybridBonus = bothSignals ? 0.05 : 0;

        const qualities = chunks.map(c => typeof c.quality_score === 'number' ? c.quality_score : 1.0);
        const avgQ = qualities.length ? (qualities.reduce((a, b) => a + b, 0) / qualities.length) : 1.0;
        const qCfg = vectorConfig.get('quality')?.retrieval || {};
        const boost = qCfg.qualityBoostFactor ?? 1.2;
        const factor = 1 + ((avgQ - 0.5) * (boost - 1));

        return {
            ...baseSimple,
            finalScore: Math.min(1.0, (baseSimple.finalScore + hybridBonus) * factor),
            diversityBonus: baseSimple.diversityBonus,
            hybridBonus,
            qualityAvg: avgQ
        };
  }

    /**
     * Compute a stable base score using configured weights without relying on BaseSearchService internals
     */
    _computeSafeBaseScore(chunks) {
        const scoringConfig = vectorConfig.get('scoring');
        if (!chunks || chunks.length === 0) {
            return { finalScore: 0, maxSimilarity: 0, avgSimilarity: 0, positionScore: 0, diversityBonus: 0 };
        }
        const sims = chunks.map(c => c.similarity || 0);
        const maxSimilarity = Math.max(...sims);
        const avgSimilarity = sims.reduce((a, b) => a + b, 0) / sims.length;
        const diversityBonus = Math.min(scoringConfig.maxDiversityBonus, chunks.length * scoringConfig.diversityBonusRate);
        const finalScoreRaw = (maxSimilarity * scoringConfig.maxSimilarityWeight) + (avgSimilarity * scoringConfig.avgSimilarityWeight) + diversityBonus;
        const finalScore = Math.min(scoringConfig.maxFinalScore, finalScoreRaw);
        return { finalScore, maxSimilarity, avgSimilarity, positionScore: 0, diversityBonus };
    }

    /**
     * Include quality info in relevance string
     */
    buildRelevanceInfo(doc, enhancedScore) {
        const base = super.buildRelevanceInfo(doc, enhancedScore);
        if (typeof enhancedScore.qualityAvg === 'number') {
            return `${base} (quality avg: ${(enhancedScore.qualityAvg).toFixed(2)})`;
        }
        return base;
    }

    /**
     * Get search type identifier
     */
    getSearchType() {
        return 'document_vector';
    }

    /**
     * Legacy method for backward compatibility
     */
    async searchDocuments(query, userId, options = {}) {
        return await this.search({
            query,
            user_id: userId,
            documentIds: options.documentIds,
            limit: options.limit || 5,
            threshold: options.threshold
        });
    }

    /**
     * Get service statistics
     */
    async getDocumentStats(userId) {
        return await this.getUserVectorStats(userId);
    }

    /**
     * Get full document text from Qdrant vectors (reconstructed from chunks)
     */
    async getDocumentFullText(userId, documentId) {
        try {
            await this.ensureInitialized();
            
            const filter = { 
                must: [
                    { key: 'user_id', match: { value: userId } },
                    { key: 'document_id', match: { value: documentId } }
                ] 
            };
            
            // Get all chunks for this document, sorted by chunk_index
            const chunks = await this.qdrantOps.scrollDocuments('documents', filter, { 
                limit: 1000, 
                withPayload: true, 
                withVector: false 
            });
            
            if (!chunks || chunks.length === 0) {
                return {
                    success: false,
                    fullText: '',
                    chunkCount: 0,
                    error: 'No chunks found for document'
                };
            }
            
            // Sort chunks by index and reconstruct text
            const sortedChunks = chunks
                .sort((a, b) => (a.payload.chunk_index || 0) - (b.payload.chunk_index || 0))
                .map(chunk => chunk.payload.chunk_text || '')
                .filter(text => text.trim().length > 0);
            
            const fullText = sortedChunks.join('\n\n');
            
            console.log(`[DocumentSearchService] Reconstructed ${fullText.length} chars from ${sortedChunks.length} chunks for document ${documentId}`);
            
            return {
                success: true,
                fullText: fullText,
                chunkCount: sortedChunks.length,
                totalCharsReconstructed: fullText.length
            };
            
        } catch (error) {
            console.error('[DocumentSearchService] Error getting full document text:', error);
            return {
                success: false,
                fullText: '',
                chunkCount: 0,
                error: error.message
            };
        }
    }

    /**
     * Get full text for multiple documents in bulk (optimized)
     */
    async getMultipleDocumentsFullText(userId, documentIds) {
        try {
            await this.ensureInitialized();

            if (!documentIds || documentIds.length === 0) {
                return { documents: [], errors: [] };
            }

            console.log(`[DocumentSearchService] Bulk retrieving full text for ${documentIds.length} documents`);

            const filter = {
                must: [
                    { key: 'user_id', match: { value: userId } },
                    { key: 'document_id', match: { any: documentIds } }
                ]
            };

            // Get all chunks for these documents in one query
            const chunks = await this.qdrantOps.scrollDocuments('documents', filter, {
                limit: documentIds.length * 20, // Assume avg 20 chunks per doc
                withPayload: true,
                withVector: false
            });

            if (!chunks || chunks.length === 0) {
                return {
                    documents: [],
                    errors: documentIds.map(id => ({ documentId: id, error: 'No chunks found' }))
                };
            }

            // Group chunks by document_id
            const chunksByDocument = {};
            chunks.forEach(chunk => {
                const docId = chunk.payload.document_id;
                if (!chunksByDocument[docId]) {
                    chunksByDocument[docId] = [];
                }
                chunksByDocument[docId].push(chunk);
            });

            // Reconstruct full text for each document
            const documents = [];
            const errors = [];

            documentIds.forEach(docId => {
                const docChunks = chunksByDocument[docId];

                if (!docChunks || docChunks.length === 0) {
                    errors.push({ documentId: docId, error: 'No chunks found for document' });
                    return;
                }

                // Sort chunks by index and reconstruct text
                const sortedChunks = docChunks
                    .sort((a, b) => (a.payload.chunk_index || 0) - (b.payload.chunk_index || 0))
                    .map(chunk => chunk.payload.chunk_text || '')
                    .filter(text => text.trim().length > 0);

                const fullText = sortedChunks.join('\n\n');

                documents.push({
                    id: docId,
                    fullText: fullText,
                    chunkCount: sortedChunks.length,
                    totalCharsReconstructed: fullText.length
                });
            });

            console.log(`[DocumentSearchService] Bulk reconstruction complete: ${documents.length} documents, ${errors.length} errors`);

            return {
                documents,
                errors
            };

        } catch (error) {
            console.error('[DocumentSearchService] Error in bulk document retrieval:', error);
            return {
                documents: [],
                errors: documentIds.map(id => ({ documentId: id, error: error.message }))
            };
        }
    }

    /**
     * Get first chunks for multiple documents for previews
     */
    async getDocumentFirstChunks(userId, documentIds) {
        try {
            await this.ensureInitialized();

            // Early return if no documents to avoid Qdrant API call with limit=0
            if (!documentIds || documentIds.length === 0) {
                return {
                    success: true,
                    chunks: {},
                    foundCount: 0
                };
            }

            const filter = {
                must: [
                    { key: 'user_id', match: { value: userId } },
                    { key: 'document_id', match: { any: documentIds } },
                    { key: 'chunk_index', match: { value: 0 } }
                ]
            };

            // Get first chunks for all documents
            const chunks = await this.qdrantOps.scrollDocuments('documents', filter, {
                limit: documentIds.length,
                withPayload: true,
                withVector: false
            });

            // Build map of documentId -> chunk_text
            const chunkMap = {};
            chunks.forEach(chunk => {
                const docId = chunk.payload.document_id;
                const text = chunk.payload.chunk_text;
                if (docId && text) {
                    chunkMap[docId] = text;
                }
            });

            return {
                success: true,
                chunks: chunkMap,
                foundCount: Object.keys(chunkMap).length
            };

        } catch (error) {
            console.error('[DocumentSearchService] Error getting first chunks:', error);
            return {
                success: false,
                chunks: {},
                foundCount: 0,
                error: error.message
            };
        }
    }

    /**
     * Check if service is ready
     */
    async isReady() {
        try {
            await this.ensureInitialized();
            return await this.qdrantOps.healthCheck();
        } catch (error) {
            console.error('[DocumentSearchService] Service not ready:', error);
            return false;
        }
    }

    /**
     * Search Bundestag content (gruene-bundestag.de crawled content)
     * @param {string} query - Search query
     * @param {Object} options - Search options
     */
    async searchBundestagContent(query, options = {}) {
        try {
            await this.ensureInitialized();

            const {
                section = null,
                limit = 10,
                threshold = 0.3,
                hybridMode = true
            } = options;

            // Generate query embedding
            const queryVector = await fastEmbedService.generateEmbedding(query);

            // Search using Qdrant
            const searchResult = await this.qdrant.searchBundestagContent(queryVector, {
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

            // Group results by URL for better presentation
            const urlGroups = new Map();
            for (const result of searchResult.results) {
                const url = result.url;
                if (!urlGroups.has(url)) {
                    urlGroups.set(url, {
                        url,
                        title: result.title,
                        section: result.section,
                        published_at: result.published_at,
                        maxScore: result.score,
                        chunks: []
                    });
                }
                const group = urlGroups.get(url);
                group.chunks.push({
                    text: result.chunk_text,
                    chunk_index: result.chunk_index,
                    score: result.score
                });
                if (result.score > group.maxScore) {
                    group.maxScore = result.score;
                }
            }

            // Convert to array and sort by score
            const groupedResults = Array.from(urlGroups.values())
                .sort((a, b) => b.maxScore - a.maxScore)
                .slice(0, limit);

            return {
                success: true,
                results: groupedResults,
                query: query.trim(),
                searchType: 'bundestag_content',
                totalHits: searchResult.total,
                message: `Found ${groupedResults.length} relevant page(s) from gruene-bundestag.de`
            };

        } catch (error) {
            console.error('[DocumentSearchService] Bundestag search failed:', error);
            return {
                success: false,
                results: [],
                error: error.message
            };
        }
    }
}

// Export service factory function for dependency injection
export function getQdrantDocumentService() {
    return new DocumentSearchService();
}

export { DocumentSearchService };

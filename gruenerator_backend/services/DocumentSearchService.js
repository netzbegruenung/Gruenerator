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
            this.qdrantOps = new QdrantOperations(this.qdrant.client);
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
            const userId = InputValidator.validateUserId(params.userId);

            // Extract and validate optional filters
            const documentIds = params.filters?.documentIds
                ? InputValidator.validateDocumentIds(params.filters.documentIds)
                : undefined;
            const sourceType = params.filters?.sourceType;
            const group_id = params.filters?.group_id;

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
                useCache: params.options?.useCache !== false
            };

            return {
                query,
                userId,
                filters: { documentIds, sourceType, group_id },
                options
            };
        }

        // Flat shape (direct external calls): delegate to InputValidator
        const validated = InputValidator.validateSearchParams(params);
        return {
            query: validated.query,
            userId: validated.user_id,
            filters: {
                documentIds: validated.documentIds,
                sourceType: validated.sourceType,
                group_id: validated.group_id
            },
            options: {
                limit: validated.limit,
                threshold: validated.threshold,
                mode: validated.mode,
                useCache: true
            }
        };
    }

    /**
     * Main search method - implements BaseSearchService template
     */
    async search(searchParams) {
        try {
            await this.ensureInitialized();
            
            // Use parent's performSimilaritySearch for consistency
            return await this.performSimilaritySearch(searchParams);

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

            // Use parent's performHybridSearch for consistency
            return await this.performHybridSearch({
                query,
                userId,
                filters: {
                    documentIds: options.documentIds,
                    sourceType: options.sourceType
                },
                options: {
                    limit: options.limit || this.defaultLimit,
                    threshold: options.threshold,
                    vectorWeight: options.vectorWeight || 0.7,
                    textWeight: options.textWeight || 0.3,
                    useRRF: options.useRRF !== false,
                    rrfK: options.rrfK || 60,
                    useCache: true
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
            
            const result = await this.qdrantOps.batchUpsert('documents', points, { wait: true });
            
            console.log(`[DocumentSearchService] Stored ${points.length} vectors for document ${documentId}`);
            return {
                success: true,
                vectorsStored: points.length,
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
        const { embedding, userId, filters, limit, threshold } = params;
        
        // Build Qdrant filter
        const filter = { must: [{ key: 'user_id', match: { value: userId } }] };
        
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
        
        const results = await this.qdrantOps.vectorSearch(
            'documents',
            embedding,
            filter,
            { limit, threshold, withPayload: true }
        );
        
        // Transform to expected format for BaseSearchService
        return results.map(result => ({
            id: result.id,
            document_id: result.payload.document_id,
            chunk_index: result.payload.chunk_index,
            chunk_text: result.payload.chunk_text,
            similarity: result.score,
            token_count: result.payload.token_count,
            created_at: result.payload.created_at,
            documents: {
                id: result.payload.document_id,
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
        
        // Build Qdrant filter
        const filter = { must: [{ key: 'user_id', match: { value: userId } }] };
        
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
        
        const hybridResult = await this.qdrantOps.hybridSearch(
            'documents',
            embedding,
            query,
            filter,
            {
                limit,
                threshold,
                ...hybridOptions
            }
        );
        
        // Transform to expected format with hybrid metadata
        return hybridResult.results.map(result => ({
            id: result.id,
            document_id: result.payload.document_id,
            chunk_index: result.payload.chunk_index,
            chunk_text: result.payload.chunk_text,
            similarity: result.score,
            token_count: result.payload.token_count,
            created_at: result.payload.created_at,
            searchMethod: result.searchMethod || 'hybrid',
            originalVectorScore: result.originalVectorScore,
            originalTextScore: result.originalTextScore,
            documents: {
                id: result.payload.document_id,
                title: result.payload.title || 'Untitled',
                filename: result.payload.filename || '',
                created_at: result.payload.created_at
            }
        }));
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
}

// Export service factory function for dependency injection
export function getQdrantDocumentService() {
    return new DocumentSearchService();
}

export { DocumentSearchService };

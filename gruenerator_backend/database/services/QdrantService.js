import { QdrantClient } from '@qdrant/js-client-rest';

/**
 * Qdrant Vector Database Service
 * Handles all vector operations for document embeddings and similarity search
 */
class QdrantService {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.collections = {
            documents: 'documents',
            grundsatz_documents: 'grundsatz_documents',
            user_knowledge: 'user_knowledge'
        };
        this.init();
    }

    /**
     * Initialize Qdrant client and create collections
     */
    async init() {
        try {
            const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
            const apiKey = process.env.QDRANT_API_KEY;

            this.client = new QdrantClient({
                url: qdrantUrl,
                ...(apiKey && { apiKey })
            });

            // Test connection
            await this.testConnection();
            
            // Create collections if they don't exist
            await this.createCollections();
            
            this.isConnected = true;
            console.log('[QdrantService] Successfully connected to Qdrant');
            
        } catch (error) {
            console.error('[QdrantService] Failed to initialize Qdrant:', error);
            this.isConnected = false;
            // Don't throw error to allow app to start without Qdrant
            console.warn('[QdrantService] Vector search will be disabled');
        }
    }

    /**
     * Test connection to Qdrant
     */
    async testConnection() {
        try {
            await this.client.getCollections();
            return true;
        } catch (error) {
            throw new Error(`Qdrant connection failed: ${error.message}`);
        }
    }

    /**
     * Create all required collections
     */
    async createCollections() {
        try {
            const collections = await this.client.getCollections();
            const existingCollections = collections.collections.map(c => c.name);

            // Document chunks collection
            if (!existingCollections.includes(this.collections.documents)) {
                await this.client.createCollection(this.collections.documents, {
                    vectors: {
                        size: 1536, // OpenAI embedding dimension
                        distance: 'Cosine'
                    },
                    optimizers_config: {
                        default_segment_number: 2,
                        max_segment_size: 20000,
                        memmap_threshold: 10000,
                        indexing_threshold: 20000
                    },
                    hnsw_config: {
                        m: 16,
                        ef_construct: 100,
                        full_scan_threshold: 10000,
                        max_indexing_threads: 0
                    }
                });
                console.log('[QdrantService] Created documents collection');
            }

            // Grundsatz documents collection
            if (!existingCollections.includes(this.collections.grundsatz_documents)) {
                await this.client.createCollection(this.collections.grundsatz_documents, {
                    vectors: {
                        size: 1536,
                        distance: 'Cosine'
                    },
                    optimizers_config: {
                        default_segment_number: 2,
                        max_segment_size: 20000
                    }
                });
                console.log('[QdrantService] Created grundsatz_documents collection');
            }

            // User knowledge collection
            if (!existingCollections.includes(this.collections.user_knowledge)) {
                await this.client.createCollection(this.collections.user_knowledge, {
                    vectors: {
                        size: 1536,
                        distance: 'Cosine'
                    },
                    optimizers_config: {
                        default_segment_number: 1,
                        max_segment_size: 10000
                    }
                });
                console.log('[QdrantService] Created user_knowledge collection');
            }

        } catch (error) {
            console.error('[QdrantService] Failed to create collections:', error);
            throw error;
        }
    }

    /**
     * Index document chunks with vectors
     */
    async indexDocumentChunks(documentId, chunks, userId = null) {
        this.ensureConnected();
        try {
            const points = chunks.map((chunk, index) => ({
                id: `${documentId}_${index}`,
                vector: chunk.embedding,
                payload: {
                    document_id: documentId,
                    chunk_index: index,
                    chunk_text: chunk.text || chunk.chunk_text,
                    token_count: chunk.token_count || chunk.tokens,
                    user_id: userId,
                    metadata: chunk.metadata || {},
                    created_at: new Date().toISOString()
                }
            }));

            await this.client.upsert(this.collections.documents, {
                points: points
            });

            console.log(`[QdrantService] Indexed ${chunks.length} chunks for document ${documentId}`);
            return { success: true, chunks: chunks.length };

        } catch (error) {
            console.error('[QdrantService] Failed to index document chunks:', error);
            throw new Error(`Vector indexing failed: ${error.message}`);
        }
    }

    /**
     * Index grundsatz document chunks
     */
    async indexGrundsatzChunks(documentId, chunks) {
        this.ensureConnected();
        try {
            const points = chunks.map((chunk, index) => ({
                id: `grundsatz_${documentId}_${index}`,
                vector: chunk.embedding,
                payload: {
                    document_id: documentId,
                    chunk_index: index,
                    chunk_text: chunk.text || chunk.chunk_text,
                    token_count: chunk.token_count || chunk.tokens,
                    metadata: chunk.metadata || {},
                    document_type: 'grundsatz',
                    created_at: new Date().toISOString()
                }
            }));

            await this.client.upsert(this.collections.grundsatz_documents, {
                points: points
            });

            console.log(`[QdrantService] Indexed ${chunks.length} grundsatz chunks for document ${documentId}`);
            return { success: true, chunks: chunks.length };

        } catch (error) {
            console.error('[QdrantService] Failed to index grundsatz chunks:', error);
            throw new Error(`Grundsatz vector indexing failed: ${error.message}`);
        }
    }

    /**
     * Search for similar documents using vector similarity
     */
    async searchDocuments(queryVector, options = {}) {
        this.ensureConnected();
        try {
            const {
                userId = null,
                documentIds = null,
                limit = 10,
                threshold = 0.3,
                collection = this.collections.documents
            } = options;

            // Build filter
            const filter = { must: [] };
            
            if (userId) {
                filter.must.push({ key: 'user_id', match: { value: userId } });
            }
            
            if (documentIds && documentIds.length > 0) {
                filter.must.push({
                    key: 'document_id',
                    match: { any: documentIds }
                });
            }

            const searchResult = await this.client.search(collection, {
                vector: queryVector,
                filter: filter.must.length > 0 ? filter : undefined,
                limit: limit,
                score_threshold: threshold,
                with_payload: true
            });

            const results = searchResult.map(hit => ({
                id: hit.id,
                score: hit.score,
                document_id: hit.payload.document_id,
                chunk_text: hit.payload.chunk_text,
                chunk_index: hit.payload.chunk_index,
                metadata: hit.payload.metadata || {},
                user_id: hit.payload.user_id
            }));

            return {
                success: true,
                results: results,
                total: results.length
            };

        } catch (error) {
            console.error('[QdrantService] Vector search failed:', error);
            throw new Error(`Vector search failed: ${error.message}`);
        }
    }

    /**
     * Search grundsatz documents
     */
    async searchGrundsatzDocuments(queryVector, options = {}) {
        return await this.searchDocuments(queryVector, {
            ...options,
            collection: this.collections.grundsatz_documents
        });
    }

    /**
     * Hybrid search combining vector and keyword search
     */
    async hybridSearch(queryVector, keywords, options = {}) {
        this.ensureConnected();
        try {
            // First, get vector results
            const vectorResults = await this.searchDocuments(queryVector, options);
            
            // For now, just return vector results
            // TODO: Implement proper hybrid search with keyword boosting
            return {
                ...vectorResults,
                search_type: 'hybrid',
                keywords: keywords
            };

        } catch (error) {
            console.error('[QdrantService] Hybrid search failed:', error);
            throw new Error(`Hybrid search failed: ${error.message}`);
        }
    }

    /**
     * Delete document vectors
     */
    async deleteDocument(documentId, collection = this.collections.documents) {
        this.ensureConnected();
        try {
            await this.client.delete(collection, {
                filter: {
                    must: [{ key: 'document_id', match: { value: documentId } }]
                }
            });

            console.log(`[QdrantService] Deleted vectors for document ${documentId}`);
            return { success: true };

        } catch (error) {
            console.error('[QdrantService] Failed to delete document vectors:', error);
            throw new Error(`Vector deletion failed: ${error.message}`);
        }
    }

    /**
     * Delete user vectors (for user deletion)
     */
    async deleteUserVectors(userId) {
        this.ensureConnected();
        try {
            // Delete from documents collection
            await this.client.delete(this.collections.documents, {
                filter: {
                    must: [{ key: 'user_id', match: { value: userId } }]
                }
            });

            // Delete from user knowledge collection
            await this.client.delete(this.collections.user_knowledge, {
                filter: {
                    must: [{ key: 'user_id', match: { value: userId } }]
                }
            });

            console.log(`[QdrantService] Deleted all vectors for user ${userId}`);
            return { success: true };

        } catch (error) {
            console.error('[QdrantService] Failed to delete user vectors:', error);
            throw new Error(`User vector deletion failed: ${error.message}`);
        }
    }

    /**
     * Get collection statistics
     */
    async getCollectionStats(collection = this.collections.documents) {
        this.ensureConnected();
        try {
            const info = await this.client.getCollection(collection);
            return {
                name: collection,
                vectors_count: info.vectors_count,
                indexed_vectors_count: info.indexed_vectors_count,
                points_count: info.points_count,
                segments_count: info.segments_count,
                status: info.status,
                optimizer_status: info.optimizer_status
            };
        } catch (error) {
            console.error('[QdrantService] Failed to get collection stats:', error);
            return { error: error.message };
        }
    }

    /**
     * Get all collection statistics
     */
    async getAllStats() {
        this.ensureConnected();
        try {
            const stats = {};
            for (const [key, collection] of Object.entries(this.collections)) {
                stats[key] = await this.getCollectionStats(collection);
            }
            return stats;
        } catch (error) {
            console.error('[QdrantService] Failed to get all stats:', error);
            return { error: error.message };
        }
    }

    /**
     * Create a snapshot for backup
     */
    async createSnapshot() {
        this.ensureConnected();
        try {
            const snapshot = await this.client.createSnapshot();
            console.log('[QdrantService] Snapshot created:', snapshot);
            return snapshot;
        } catch (error) {
            console.error('[QdrantService] Failed to create snapshot:', error);
            throw new Error(`Snapshot creation failed: ${error.message}`);
        }
    }

    /**
     * Check if Qdrant is available
     */
    isAvailable() {
        return this.isConnected && this.client !== null;
    }

    /**
     * Ensure connection is available
     */
    ensureConnected() {
        if (!this.isAvailable()) {
            throw new Error('Qdrant is not available. Vector search functionality is disabled.');
        }
    }

    /**
     * Graceful shutdown
     */
    async close() {
        // Qdrant client doesn't need explicit closing
        this.isConnected = false;
        this.client = null;
        console.log('[QdrantService] Connection closed');
    }
}

// Export singleton instance
let qdrantInstance = null;

export function getQdrantInstance() {
    if (!qdrantInstance) {
        qdrantInstance = new QdrantService();
    }
    return qdrantInstance;
}

export { QdrantService };
export default QdrantService;
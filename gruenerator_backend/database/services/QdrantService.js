import { QdrantClient } from '@qdrant/js-client-rest';
import { fastEmbedService } from '../../services/FastEmbedService.js';
import http from 'http';
import https from 'https';

/**
 * Qdrant Vector Database Service
 * Handles all vector operations for document embeddings and similarity search
 */
class QdrantService {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.isInitializing = false;
        this.initPromise = null;
        this.collections = {
            documents: 'documents',
            grundsatz_documents: 'grundsatz_documents',
            user_knowledge: 'user_knowledge',
            content_examples: 'content_examples',
            social_media_examples: 'social_media_examples',
            user_texts: 'user_texts',
            qa_collections: 'qa_collections',
            qa_collection_documents: 'qa_collection_documents',
            qa_usage_logs: 'qa_usage_logs',
            qa_public_access: 'qa_public_access'
        };
        this.lastHealthCheck = 0;
        this.healthCheckInterval = 30000; // 30 seconds
        // Initialize asynchronously to avoid circular promise reference
        this._startInitialization();
    }

    /**
     * Start initialization asynchronously to avoid circular promise reference
     */
    _startInitialization() {
        // Use setTimeout to break the circular reference by deferring initialization
        setTimeout(() => {
            this.initPromise = this._performInit();
        }, 0);
    }

    /**
     * Initialize Qdrant client and create collections
     */
    async init() {
        // Return existing promise if initialization is already in progress
        if (this.initPromise) {
            return this.initPromise;
        }

        // Return resolved promise if already connected
        if (this.isConnected) {
            return Promise.resolve();
        }

        // Create new initialization promise
        this.initPromise = this._performInit();
        
        try {
            await this.initPromise;
        } catch (error) {
            // Reset initPromise on failure to allow retry
            this.initPromise = null;
            throw error;
        }

        return this.initPromise;
    }

    /**
     * Internal method to perform the actual initialization
     */
    async _performInit() {
        // Double-check to prevent race conditions
        if (this.isInitializing || this.isConnected) {
            return;
        }

        this.isInitializing = true;

        try {
            // Hardcoded domain for testing
            const qdrantUrl = 'https://qdrant.services.moritz-waechter.de:443';
            const apiKey = process.env.QDRANT_API_KEY;

            // Configure HTTP agent for better connection handling
            const isHttps = qdrantUrl.startsWith('https');
            const httpAgent = new (isHttps ? https : http).Agent({
                keepAlive: true,
                keepAliveMsecs: 1000,
                maxSockets: 10,
                maxFreeSockets: 5,
                timeout: 30000,
                freeSocketTimeout: 15000
            });

            // Use host/port approach for HTTPS support due to Qdrant client URL parsing bug
            if (qdrantUrl.startsWith('https://')) {
                const url = new URL(qdrantUrl);
                this.client = new QdrantClient({
                    host: url.hostname,
                    port: url.port ? parseInt(url.port) : 443,
                    https: true,
                    ...(apiKey && { apiKey }),
                    timeout: 60000,
                    checkCompatibility: false,  // Skip compatibility check for faster startup
                    agent: httpAgent
                });
            } else {
                this.client = new QdrantClient({
                    url: qdrantUrl,
                    ...(apiKey && { apiKey }),
                    https: false,  // Force HTTP for non-HTTPS URLs
                    timeout: 60000,
                    agent: httpAgent
                });
            }

            // Test connection with retry
            await this.testConnectionWithRetry();
            
            // Wait for FastEmbed to initialize to get dimensions
            await fastEmbedService.init();
            this.vectorSize = fastEmbedService.getDimensions();
            console.log(`[QdrantService] Using vector dimensions: ${this.vectorSize}`);
            
            // Create collections if they don't exist
            await this.createCollections();
            
            this.isConnected = true;
            this.isInitializing = false;
            this.lastHealthCheck = Date.now();
            console.log('[QdrantService] Successfully connected to Qdrant');
            
        } catch (error) {
            console.error('[QdrantService] Failed to initialize Qdrant:', error);
            this.isConnected = false;
            this.isInitializing = false;
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
     * Test connection with retry logic
     */
    async testConnectionWithRetry() {
        const maxRetries = 3;
        let lastError;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                await this.client.getCollections();
                console.log(`[QdrantService] Connection test successful (attempt ${attempt})`);
                return true;
            } catch (error) {
                lastError = error;
                console.warn(`[QdrantService] Connection test attempt ${attempt}/${maxRetries} failed:`, error.message);
                
                // Log additional error details for debugging
                if (error.cause) {
                    console.warn(`[QdrantService] Error cause:`, error.cause.message);
                }
                if (error.code) {
                    console.warn(`[QdrantService] Error code:`, error.code);
                }
                
                if (attempt < maxRetries) {
                    const delay = Math.pow(2, attempt) * 1000;
                    console.log(`[QdrantService] Retrying connection in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        throw new Error(`Qdrant connection failed after ${maxRetries} attempts: ${lastError.message}`);
    }

    /**
     * Check connection health and reconnect if needed
     */
    async ensureConnection() {
        const now = Date.now();
        
        // Skip health check if recently performed
        if (now - this.lastHealthCheck < this.healthCheckInterval) {
            return;
        }

        try {
            if (!this.isConnected) {
                console.log('[QdrantService] Connection lost, attempting to reconnect...');
                // Reset initPromise to allow new initialization attempt
                this.initPromise = null;
                await this.init();
                return;
            }

            // Test current connection with a simple operation
            await this.client.getCollections();
            this.lastHealthCheck = now;
        } catch (error) {
            console.warn('[QdrantService] Health check failed, reconnecting:', error.message);
            
            // Check for SSL-related errors and force full reinitialize
            if (error.message && (error.message.includes('SSL') || error.message.includes('wrong version'))) {
                console.log('[QdrantService] SSL error detected, forcing full reconnection...');
                // Force complete reinitialization
                this.client = null;
                this.isConnected = false;
                this.isInitializing = false;
                this.initPromise = null;
            } else {
                this.isConnected = false;
                // Reset initPromise to allow new initialization attempt
                this.initPromise = null;
            }
            
            await this.init();
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
                        size: this.vectorSize, // FastEmbed embedding dimension
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
                console.log(`[QdrantService] Created documents collection with ${this.vectorSize} dimensions`);
            }

            // Grundsatz documents collection
            if (!existingCollections.includes(this.collections.grundsatz_documents)) {
                await this.client.createCollection(this.collections.grundsatz_documents, {
                    vectors: {
                        size: this.vectorSize,
                        distance: 'Cosine'
                    },
                    optimizers_config: {
                        default_segment_number: 2,
                        max_segment_size: 20000
                    }
                });
                console.log(`[QdrantService] Created grundsatz_documents collection with ${this.vectorSize} dimensions`);
            }

            // User knowledge collection
            if (!existingCollections.includes(this.collections.user_knowledge)) {
                await this.client.createCollection(this.collections.user_knowledge, {
                    vectors: {
                        size: this.vectorSize,
                        distance: 'Cosine'
                    },
                    optimizers_config: {
                        default_segment_number: 1,
                        max_segment_size: 10000
                    }
                });
                console.log(`[QdrantService] Created user_knowledge collection with ${this.vectorSize} dimensions`);
            }

            // Content examples collection
            if (!existingCollections.includes(this.collections.content_examples)) {
                await this.client.createCollection(this.collections.content_examples, {
                    vectors: {
                        size: this.vectorSize,
                        distance: 'Cosine'
                    },
                    optimizers_config: {
                        default_segment_number: 1,
                        max_segment_size: 5000
                    },
                    hnsw_config: {
                        m: 16,
                        ef_construct: 100
                    }
                });
                console.log(`[QdrantService] Created content_examples collection with ${this.vectorSize} dimensions`);
            }

            // Social media examples collection (Facebook + Instagram with multitenancy)
            if (!existingCollections.includes(this.collections.social_media_examples)) {
                try {
                    await this.client.createCollection(this.collections.social_media_examples, {
                        vectors: {
                            size: this.vectorSize,
                            distance: 'Cosine'
                        },
                        optimizers_config: {
                            default_segment_number: 2,     // Better performance per Qdrant best practices
                            max_segment_size: 20000,       // Larger segments for efficiency
                            memmap_threshold: 10000,
                            indexing_threshold: 20000
                        },
                        hnsw_config: {
                            payload_m: 16,                 // Enable payload-based indexing for multitenancy
                            m: 16,                         // Enable HNSW index for fast vector search
                            ef_construct: 200,             // Better index quality
                            full_scan_threshold: 10000,
                            max_indexing_threads: 0
                        }
                    });
                    console.log(`[QdrantService] Created social_media_examples collection with ${this.vectorSize} dimensions (multitenancy optimized)`);

                    // Create keyword index for platform field with tenant optimization
                    await this.client.createPayloadIndex(this.collections.social_media_examples, {
                        field_name: 'platform',
                        field_schema: {
                            type: 'keyword',
                            is_tenant: true  // Optimize storage for tenant-based access patterns
                        }
                    });
                    console.log(`[QdrantService] Created tenant-optimized index for platform field`);
                } catch (error) {
                    // Handle race condition - collection might have been created by another instance
                    if (error.message && error.message.includes('already exists')) {
                        console.log(`[QdrantService] Collection ${this.collections.social_media_examples} already exists (race condition handled)`);
                    } else {
                        throw error; // Re-throw if it's a different error
                    }
                }
            }

            // User texts collection (for saved library texts)
            if (!existingCollections.includes(this.collections.user_texts)) {
                await this.client.createCollection(this.collections.user_texts, {
                    vectors: {
                        size: this.vectorSize, // 1024 for FastEmbed
                        distance: 'Cosine'
                    },
                    optimizers_config: {
                        default_segment_number: 2,
                        max_segment_size: 20000,
                        memmap_threshold: 10000,
                        indexing_threshold: 20000
                    },
                    hnsw_config: {
                        payload_m: 16,                 // Enable payload-based indexing for multitenancy
                        m: 16,                         // Enable HNSW index for fast vector search
                        ef_construct: 200,             // Better index quality
                        full_scan_threshold: 10000,
                        max_indexing_threads: 0
                    }
                });
                console.log(`[QdrantService] Created user_texts collection with ${this.vectorSize} dimensions (user-scoped)`);

                // Create indexes for efficient filtering
                await this.client.createPayloadIndex(this.collections.user_texts, {
                    field_name: 'user_id',
                    field_schema: {
                        type: 'keyword',
                        is_tenant: true  // Optimize for user-based filtering
                    }
                });
                console.log(`[QdrantService] Created user_id tenant index for user_texts`);

                await this.client.createPayloadIndex(this.collections.user_texts, {
                    field_name: 'document_type',
                    field_schema: {
                        type: 'keyword'
                    }
                });
                console.log(`[QdrantService] Created document_type index for user_texts`);
                
                await this.client.createPayloadIndex(this.collections.user_texts, {
                    field_name: 'title',
                    field_schema: {
                        type: 'keyword'
                    }
                });
                console.log(`[QdrantService] Created title index for user_texts`);
            }

            // Q&A collections collection (metadata storage)
            if (!existingCollections.includes(this.collections.qa_collections)) {
                await this.client.createCollection(this.collections.qa_collections, {
                    vectors: {
                        size: this.vectorSize,
                        distance: 'Cosine'
                    },
                    optimizers_config: {
                        default_segment_number: 1,
                        max_segment_size: 5000
                    }
                });
                console.log(`[QdrantService] Created qa_collections collection with ${this.vectorSize} dimensions`);

                // Create indexes for efficient filtering
                await this.client.createPayloadIndex(this.collections.qa_collections, {
                    field_name: 'user_id',
                    field_schema: {
                        type: 'keyword',
                        is_tenant: true
                    }
                });

                await this.client.createPayloadIndex(this.collections.qa_collections, {
                    field_name: 'collection_id',
                    field_schema: {
                        type: 'keyword'
                    }
                });
            }

            // Q&A collection documents junction collection
            if (!existingCollections.includes(this.collections.qa_collection_documents)) {
                await this.client.createCollection(this.collections.qa_collection_documents, {
                    vectors: {
                        size: this.vectorSize,
                        distance: 'Cosine'
                    },
                    optimizers_config: {
                        default_segment_number: 1,
                        max_segment_size: 5000
                    }
                });
                console.log(`[QdrantService] Created qa_collection_documents collection with ${this.vectorSize} dimensions`);

                // Create indexes for efficient filtering
                await this.client.createPayloadIndex(this.collections.qa_collection_documents, {
                    field_name: 'collection_id',
                    field_schema: {
                        type: 'keyword'
                    }
                });

                await this.client.createPayloadIndex(this.collections.qa_collection_documents, {
                    field_name: 'document_id',
                    field_schema: {
                        type: 'keyword'
                    }
                });
            }

            // Q&A usage logs collection
            if (!existingCollections.includes(this.collections.qa_usage_logs)) {
                await this.client.createCollection(this.collections.qa_usage_logs, {
                    vectors: {
                        size: this.vectorSize,
                        distance: 'Cosine'
                    },
                    optimizers_config: {
                        default_segment_number: 1,
                        max_segment_size: 10000
                    }
                });
                console.log(`[QdrantService] Created qa_usage_logs collection with ${this.vectorSize} dimensions`);

                // Create indexes for efficient filtering
                await this.client.createPayloadIndex(this.collections.qa_usage_logs, {
                    field_name: 'collection_id',
                    field_schema: {
                        type: 'keyword'
                    }
                });

                await this.client.createPayloadIndex(this.collections.qa_usage_logs, {
                    field_name: 'user_id',
                    field_schema: {
                        type: 'keyword'
                    }
                });
            }

            // Q&A public access collection
            if (!existingCollections.includes(this.collections.qa_public_access)) {
                await this.client.createCollection(this.collections.qa_public_access, {
                    vectors: {
                        size: this.vectorSize,
                        distance: 'Cosine'
                    },
                    optimizers_config: {
                        default_segment_number: 1,
                        max_segment_size: 1000
                    }
                });
                console.log(`[QdrantService] Created qa_public_access collection with ${this.vectorSize} dimensions`);

                // Create indexes for efficient filtering
                await this.client.createPayloadIndex(this.collections.qa_public_access, {
                    field_name: 'access_token',
                    field_schema: {
                        type: 'keyword'
                    }
                });

                await this.client.createPayloadIndex(this.collections.qa_public_access, {
                    field_name: 'collection_id',
                    field_schema: {
                        type: 'keyword'
                    }
                });
            }

            // Create text search indexes for hybrid search
            await this.createTextSearchIndexes();

        } catch (error) {
            console.error('[QdrantService] Failed to create collections:', error);
            throw error;
        }
    }

    /**
     * Create text search indexes for hybrid search
     */
    async createTextSearchIndexes() {
        try {
            console.log('[QdrantService] Creating text search indexes for hybrid search...');
            
            // Define collections that need text search indexes
            const collectionsToIndex = [
                this.collections.documents,
                this.collections.grundsatz_documents,
                this.collections.user_knowledge
            ];

            for (const collectionName of collectionsToIndex) {
                try {
                    // Create text index for chunk_text field
                    await this.client.createPayloadIndex(collectionName, {
                        field_name: 'chunk_text',
                        field_schema: {
                            type: 'text',
                            tokenizer: 'word',
                            min_token_len: 2,
                            max_token_len: 50,
                            lowercase: true
                        }
                    });
                    console.log(`[QdrantService] Created text index for chunk_text in ${collectionName}`);
                    
                    // Create keyword index for title field
                    await this.client.createPayloadIndex(collectionName, {
                        field_name: 'title',
                        field_schema: {
                            type: 'keyword'
                        }
                    });
                    console.log(`[QdrantService] Created keyword index for title in ${collectionName}`);

                    // Create keyword index for filename field
                    await this.client.createPayloadIndex(collectionName, {
                        field_name: 'filename',
                        field_schema: {
                            type: 'keyword'
                        }
                    });
                    console.log(`[QdrantService] Created keyword index for filename in ${collectionName}`);

                    // Create keyword index for user_id field for filtering
                    await this.client.createPayloadIndex(collectionName, {
                        field_name: 'user_id',
                        field_schema: {
                            type: 'keyword',
                            is_tenant: true  // Optimize for user-based filtering
                        }
                    });
                    console.log(`[QdrantService] Created user_id tenant index in ${collectionName}`);

                } catch (indexError) {
                    // Indexes might already exist, log warning but continue
                    if (indexError.message && (indexError.message.includes('already exists') || indexError.message.includes('index already created'))) {
                        console.log(`[QdrantService] Text indexes already exist for ${collectionName}, skipping...`);
                    } else {
                        console.warn(`[QdrantService] Failed to create text index for ${collectionName}:`, indexError.message);
                    }
                }
            }
            
            console.log('[QdrantService] Text search indexes creation completed');
            
        } catch (error) {
            console.error('[QdrantService] Failed to create text search indexes:', error);
            // Don't throw - this is not critical for basic functionality
        }
    }

    /**
     * Index document chunks with vectors
     */
    async indexDocumentChunks(documentId, chunks, userId = null, collectionName = null) {
        this.ensureConnected();
        try {
            const points = chunks.map((chunk, index) => {
                // Generate numeric ID: hash of documentId + index to ensure uniqueness
                const combinedString = `${documentId}_${index}`;
                let hash = 0;
                for (let i = 0; i < combinedString.length; i++) {
                    const char = combinedString.charCodeAt(i);
                    hash = ((hash << 5) - hash) + char;
                    hash = hash & hash; // Convert to 32-bit integer
                }
                // Ensure positive integer
                const numericId = Math.abs(hash);
                
                return {
                    id: numericId,
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
                };
            });

            const targetCollection = collectionName || this.collections.documents;
            await this.client.upsert(targetCollection, {
                points: points
            });

            console.log(`[QdrantService] Indexed ${chunks.length} chunks for document ${documentId} in collection ${targetCollection}`);
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
     * Hybrid search combining vector and keyword search with Reciprocal Rank Fusion
     * @deprecated Use QdrantOperations.hybridSearch() instead
     */
    async hybridSearch(queryVector, query, options = {}) {
        console.warn('[QdrantService] hybridSearch is deprecated. Use QdrantOperations.hybridSearch() instead');
        
        // Import QdrantOperations for delegation
        const { QdrantOperations } = await import('./QdrantOperations.js');
        const operations = new QdrantOperations(this.client);
        
        // Build filter from options
        const filter = { must: [] };
        if (options.userId) {
            filter.must.push({ key: 'user_id', match: { value: options.userId } });
        }
        if (options.documentIds && options.documentIds.length > 0) {
            filter.must.push({ key: 'document_id', match: { any: options.documentIds } });
        }
        
        return await operations.hybridSearch(
            options.collection || this.collections.documents,
            queryVector,
            query,
            filter,
            options
        );
    }

    // NOTE: Text search operations moved to QdrantOperations.js

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
     * Index content examples
     */
    async indexContentExample(exampleId, embedding, metadata) {
        this.ensureConnected();
        try {
            // Generate numeric ID from UUID
            let hash = 0;
            for (let i = 0; i < exampleId.length; i++) {
                const char = exampleId.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            const numericId = Math.abs(hash);

            const point = {
                id: numericId,
                vector: embedding,
                payload: {
                    example_id: exampleId,
                    type: metadata.type,
                    title: metadata.title,
                    content: metadata.content,
                    categories: metadata.categories || [],
                    tags: metadata.tags || [],
                    description: metadata.description,
                    content_data: metadata.content_data,
                    metadata: metadata.metadata || {},
                    created_at: metadata.created_at || new Date().toISOString()
                }
            };

            await this.client.upsert(this.collections.content_examples, {
                points: [point]
            });

            console.log(`[QdrantService] Indexed content example ${exampleId}`);
            return { success: true };

        } catch (error) {
            console.error('[QdrantService] Failed to index content example:', error);
            throw new Error(`Content example indexing failed: ${error.message}`);
        }
    }

    /**
     * Search content examples using vector similarity
     */
    async searchContentExamples(queryVector, options = {}) {
        this.ensureConnected();
        try {
            const {
                contentType = null,
                limit = 10,
                threshold = 0.3,
                categories = null,
                tags = null
            } = options;

            // Build filter
            const filter = { must: [] };
            
            if (contentType) {
                filter.must.push({ key: 'type', match: { value: contentType } });
            }
            
            if (categories && categories.length > 0) {
                filter.must.push({
                    key: 'categories',
                    match: { any: categories }
                });
            }

            if (tags && tags.length > 0) {
                filter.must.push({
                    key: 'tags',
                    match: { any: tags }
                });
            }

            const searchResult = await this.client.search(this.collections.content_examples, {
                vector: queryVector,
                filter: filter.must.length > 0 ? filter : undefined,
                limit: limit,
                score_threshold: threshold,
                with_payload: true,
                params: {
                    ef: Math.max(100, limit * 2)  // Better search quality per Qdrant best practices
                }
            });

            const results = searchResult.map(hit => ({
                id: hit.payload.example_id,
                score: hit.score,
                title: hit.payload.title,
                content: hit.payload.content,
                type: hit.payload.type,
                categories: hit.payload.categories,
                tags: hit.payload.tags,
                description: hit.payload.description,
                content_data: hit.payload.content_data,
                metadata: hit.payload.metadata,
                created_at: hit.payload.created_at,
                similarity_score: hit.score
            }));

            return {
                success: true,
                results: results,
                total: results.length
            };

        } catch (error) {
            console.error('[QdrantService] Content examples search failed:', error);
            throw new Error(`Content examples search failed: ${error.message}`);
        }
    }

    /**
     * Get random content examples from Qdrant
     */
    async getRandomContentExamples(options = {}) {
        this.ensureConnected();
        try {
            const {
                contentType = null,
                limit = 10,
                categories = null,
                tags = null
            } = options;

            // Build filter for random sampling
            const filter = { must: [] };
            
            if (contentType) {
                filter.must.push({ key: 'type', match: { value: contentType } });
            }
            
            if (categories && categories.length > 0) {
                filter.must.push({
                    key: 'categories',
                    match: { any: categories }
                });
            }

            if (tags && tags.length > 0) {
                filter.must.push({
                    key: 'tags',
                    match: { any: tags }
                });
            }

            // Get total count of points matching the filter
            const countResult = await this.client.count(this.collections.content_examples, {
                filter: filter.must.length > 0 ? filter : undefined,
                exact: true
            });

            const totalPoints = countResult.count;
            
            if (totalPoints === 0) {
                return { success: true, results: [], total: 0 };
            }

            // Calculate random offset for proper sampling
            const maxOffset = Math.max(0, totalPoints - limit);
            const randomOffset = Math.floor(Math.random() * (maxOffset + 1));

            // Use scroll API for true random sampling
            const scrollResult = await this.client.scroll(this.collections.content_examples, {
                filter: filter.must.length > 0 ? filter : undefined,
                limit: Math.min(limit * 2, totalPoints), // Get extra for shuffling
                offset: randomOffset,
                with_payload: true,
                with_vector: false // Don't need vectors for display
            });

            if (!scrollResult.points || scrollResult.points.length === 0) {
                return { success: true, results: [], total: 0 };
            }

            // Shuffle results for additional randomness and limit to requested amount
            const shuffled = scrollResult.points.sort(() => Math.random() - 0.5);
            const finalResults = shuffled.slice(0, limit);

            const results = finalResults.map(point => ({
                id: point.payload.example_id,
                title: point.payload.title,
                content: point.payload.content,
                type: point.payload.type,
                categories: point.payload.categories,
                tags: point.payload.tags,
                description: point.payload.description,
                content_data: point.payload.content_data,
                metadata: point.payload.metadata,
                created_at: point.payload.created_at
            }));

            return {
                success: true,
                results: results,
                total: results.length
            };

        } catch (error) {
            console.error('[QdrantService] Random content examples failed:', error);
            throw new Error(`Random content examples failed: ${error.message}`);
        }
    }

    /**
     * Delete content example
     */
    async deleteContentExample(exampleId) {
        this.ensureConnected();
        try {
            await this.client.delete(this.collections.content_examples, {
                filter: {
                    must: [{ key: 'example_id', match: { value: exampleId } }]
                }
            });

            console.log(`[QdrantService] Deleted content example ${exampleId}`);
            return { success: true };

        } catch (error) {
            console.error('[QdrantService] Failed to delete content example:', error);
            throw new Error(`Content example deletion failed: ${error.message}`);
        }
    }

    /**
     * Index social media example (Facebook or Instagram) with multitenancy
     */
    async indexSocialMediaExample(exampleId, embedding, content, platform) {
        this.ensureConnected();
        try {
            const numericId = Math.abs(exampleId.split('').reduce((hash, char) => 
                ((hash << 5) - hash) + char.charCodeAt(0), 0));

            const point = {
                id: numericId,
                vector: embedding,
                payload: {
                    example_id: exampleId,
                    platform: platform,  // 'facebook' or 'instagram'
                    content: content,
                    created_at: new Date().toISOString()
                }
            };

            await this.client.upsert(this.collections.social_media_examples, {
                points: [point]
            });

            console.log(`[QdrantService] Indexed ${platform} example ${exampleId}`);
            return { success: true };

        } catch (error) {
            console.error(`[QdrantService] Failed to index ${platform} example:`, error);
            throw new Error(`${platform} example indexing failed: ${error.message}`);
        }
    }

    /**
     * Search social media examples with platform filtering (multitenancy)
     */
    async searchSocialMediaExamples(queryVector, options = {}) {
        this.ensureConnected();
        try {
            const {
                platform = null,  // 'facebook', 'instagram', or null for all platforms
                limit = 10,
                threshold = 0.3
            } = options;

            // Build filter for platform (tenant) filtering
            const filter = platform ? {
                must: [{ key: 'platform', match: { value: platform } }]
            } : undefined;

            const searchResult = await this.client.search(this.collections.social_media_examples, {
                vector: queryVector,
                filter: filter,
                limit: limit,
                score_threshold: threshold,
                with_payload: true,
                params: {
                    ef: Math.max(100, limit * 2)  // Better search quality per Qdrant best practices
                }
            });

            const results = searchResult.map(hit => ({
                id: hit.payload.example_id,
                score: hit.score,
                content: hit.payload.content,
                platform: hit.payload.platform,
                created_at: hit.payload.created_at
            }));

            return {
                success: true,
                results: results,
                total: results.length
            };

        } catch (error) {
            console.error('[QdrantService] Social media search failed:', error);
            throw new Error(`Social media search failed: ${error.message}`);
        }
    }

    /**
     * Search Facebook examples (convenience method)
     */
    async searchFacebookExamples(queryVector, options = {}) {
        return await this.searchSocialMediaExamples(queryVector, { ...options, platform: 'facebook' });
    }

    /**
     * Search Instagram examples (convenience method)
     */
    async searchInstagramExamples(queryVector, options = {}) {
        return await this.searchSocialMediaExamples(queryVector, { ...options, platform: 'instagram' });
    }

    /**
     * Get random social media examples with platform filtering
     * Uses proper random sampling with scroll API for true randomness
     */
    async getRandomSocialMediaExamples(options = {}) {
        this.ensureConnected();
        try {
            const {
                platform = null,
                limit = 10
            } = options;

            // Build filter for platform if specified
            const filter = platform ? {
                must: [{ key: 'platform', match: { value: platform } }]
            } : undefined;

            // Get total count of points matching the filter
            const countResult = await this.client.count(this.collections.social_media_examples, {
                filter: filter,
                exact: true
            });

            const totalPoints = countResult.count;
            
            if (totalPoints === 0) {
                return { success: true, results: [], total: 0 };
            }

            // Calculate random offset for proper sampling
            const maxOffset = Math.max(0, totalPoints - limit);
            const randomOffset = Math.floor(Math.random() * (maxOffset + 1));

            // Use scroll API for true random sampling
            const scrollResult = await this.client.scroll(this.collections.social_media_examples, {
                filter: filter,
                limit: Math.min(limit * 2, totalPoints), // Get extra for shuffling
                offset: randomOffset,
                with_payload: true,
                with_vector: false // Don't need vectors for display
            });

            if (!scrollResult.points || scrollResult.points.length === 0) {
                return { success: true, results: [], total: 0 };
            }

            // Shuffle results for additional randomness and limit to requested amount
            const shuffled = scrollResult.points.sort(() => Math.random() - 0.5);
            const finalResults = shuffled.slice(0, limit);

            const results = finalResults.map(point => ({
                id: point.payload.example_id,
                content: point.payload.content,
                platform: point.payload.platform,
                created_at: point.payload.created_at
            }));

            return {
                success: true,
                results: results,
                total: results.length
            };

        } catch (error) {
            console.error('[QdrantService] Random social media examples failed:', error);
            throw new Error(`Random social media examples failed: ${error.message}`);
        }
    }

    /**
     * Check if points exist in collection
     * @param {Array<string>} pointIds - Array of point IDs to check
     * @param {string} collection - Collection name
     * @returns {Promise<Object>} Object with existing and missing point IDs
     */
    async checkExistingPoints(pointIds, collection = this.collections.social_media_examples) {
        this.ensureConnected();
        try {
            if (!pointIds || pointIds.length === 0) {
                return { existing: [], missing: pointIds || [] };
            }

            // Convert string IDs to numeric IDs using same hash function
            const numericIds = pointIds.map(id => {
                const hash = Math.abs(id.split('').reduce((hash, char) => 
                    ((hash << 5) - hash) + char.charCodeAt(0), 0));
                return hash;
            });

            const result = await this.client.retrieve(collection, {
                ids: numericIds,
                with_payload: false,
                with_vector: false
            });

            const existingNumericIds = new Set(result.map(point => point.id));
            const existing = [];
            const missing = [];

            pointIds.forEach((pointId, index) => {
                const numericId = numericIds[index];
                if (existingNumericIds.has(numericId)) {
                    existing.push(pointId);
                } else {
                    missing.push(pointId);
                }
            });

            return { existing, missing };

        } catch (error) {
            console.error('[QdrantService] Failed to check existing points:', error);
            // If check fails, assume all are missing to avoid duplicates
            return { existing: [], missing: pointIds };
        }
    }

    /**
     * Batch upsert social media examples
     * @param {Array} examples - Array of example objects with id, embedding, content, platform
     * @returns {Promise<Object>} Result with success count and errors
     * @deprecated Use QdrantOperations.batchUpsert() instead
     */
    async batchUpsertSocialMediaExamples(examples) {
        console.warn('[QdrantService] batchUpsertSocialMediaExamples is deprecated. Use QdrantOperations.batchUpsert() instead');
        
        if (!examples || examples.length === 0) {
            return { success: true, indexed: 0, errors: [] };
        }

        // Import QdrantOperations for delegation
        const { QdrantOperations } = await import('./QdrantOperations.js');
        const operations = new QdrantOperations(this.client);

        const points = examples.map(example => {
            const numericId = Math.abs(example.id.split('').reduce((hash, char) => 
                ((hash << 5) - hash) + char.charCodeAt(0), 0));

            return {
                id: numericId,
                vector: example.embedding,
                payload: {
                    example_id: example.id,
                    platform: example.platform,
                    content: example.content,
                    created_at: new Date().toISOString()
                }
            };
        });

        try {
            await operations.batchUpsert(this.collections.social_media_examples, points, { maxRetries: 3 });
            return { 
                success: true, 
                indexed: examples.length,
                errors: []
            };
        } catch (error) {
            console.error('[QdrantService] Batch upsert failed:', error);
            return { 
                success: false, 
                indexed: 0,
                errors: [{ message: error.message, count: examples.length }]
            };
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
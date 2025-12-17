import { QdrantClient } from '@qdrant/js-client-rest';
import { fastEmbedService } from '../../services/FastEmbedService.js';
import http from 'http';
import https from 'https';
import dotenv from 'dotenv';
import { createLogger } from '../../utils/logger.js';
import { stringToNumericId, chunkToNumericId } from '../../utils/idHasher.js';
import {
    COLLECTION_SCHEMAS,
    TEXT_SEARCH_COLLECTIONS,
    TEXT_SEARCH_INDEXES,
    getCollectionConfig,
    getIndexSchema
} from '../../config/qdrantCollectionsSchema.js';

const log = createLogger('Qdrant');

// Load environment variables
dotenv.config();

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
            oesterreich_gruene_documents: 'oesterreich_gruene_documents',
            user_knowledge: 'user_knowledge',
            content_examples: 'content_examples',
            social_media_examples: 'social_media_examples',
            user_texts: 'user_texts',
            notebook_collections: 'notebook_collections',
            notebook_collection_documents: 'notebook_collection_documents',
            notebook_usage_logs: 'notebook_usage_logs',
            notebook_public_access: 'notebook_public_access',
            oparl_papers: 'oparl_papers'
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
            const apiKey = process.env.QDRANT_API_KEY;
            const qdrantUrl = process.env.QDRANT_URL;

            if (!apiKey || apiKey.trim() === '') {
                throw new Error('QDRANT_API_KEY environment variable is required but not set or empty');
            }

            log.debug(`Connecting to ${qdrantUrl}`);

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

            const basicAuthUsername = process.env.QDRANT_BASIC_AUTH_USERNAME;
            const basicAuthPassword = process.env.QDRANT_BASIC_AUTH_PASSWORD;
            const headers = {};

            if (basicAuthUsername && basicAuthPassword) {
                const basicAuth = Buffer.from(`${basicAuthUsername}:${basicAuthPassword}`).toString('base64');
                headers['Authorization'] = `Basic ${basicAuth}`;
            }

            // Use host/port approach for HTTPS support due to Qdrant client URL parsing bug
            if (qdrantUrl.startsWith('https://')) {
                const url = new URL(qdrantUrl);
                const port = url.port ? parseInt(url.port) : 443;

                // Extract path as prefix if it exists (e.g., /qdrant/)
                const basePath = url.pathname && url.pathname !== '/' ? url.pathname : undefined;

                this.client = new QdrantClient({
                    host: url.hostname,
                    port: port,
                    https: true,
                    apiKey: apiKey,
                    timeout: 60000,
                    checkCompatibility: false,  // Skip compatibility check for faster startup
                    agent: httpAgent,
                    ...(Object.keys(headers).length > 0 ? { headers } : {}),
                    ...(basePath ? { prefix: basePath } : {})
                });
            } else {
                this.client = new QdrantClient({
                    url: qdrantUrl,
                    apiKey: apiKey,
                    https: false,  // Force HTTP for non-HTTPS URLs
                    timeout: 60000,
                    agent: httpAgent,
                    ...(Object.keys(headers).length > 0 ? { headers } : {})
                });
            }

            // Test connection with retry
            await this.testConnectionWithRetry();
            
            // Wait for FastEmbed to initialize to get dimensions
            await fastEmbedService.init();
            this.vectorSize = fastEmbedService.getDimensions();

            // Create collections if they don't exist
            await this.createCollections();

            this.isConnected = true;
            this.isInitializing = false;
            this.lastHealthCheck = Date.now();
            log.info('Connected');

        } catch (error) {
            log.error(`Init failed: ${error.message}`);
            this.isConnected = false;
            this.isInitializing = false;
            log.warn('Vector search will be disabled');
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
                log.debug(`Connection test successful (attempt ${attempt})`);
                return true;
            } catch (error) {
                lastError = error;
                log.debug(`Connection attempt ${attempt}/${maxRetries} failed: ${error.message}`);

                if (attempt < maxRetries) {
                    const delay = Math.pow(2, attempt) * 1000;
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
                log.debug('Connection lost, reconnecting...');
                this.initPromise = null;
                await this.init();
                return;
            }

            await this.client.getCollections();
            this.lastHealthCheck = now;
        } catch (error) {
            log.debug(`Health check failed: ${error.message}`);

            if (error.message && (error.message.includes('SSL') || error.message.includes('wrong version'))) {
                log.debug('SSL error detected, forcing full reconnection...');
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
                log.debug(`Created documents collection (${this.vectorSize} dims)`);
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
                log.debug(`Created grundsatz_documents collection (${this.vectorSize} dims)`);
            }

            // Austrian Greens documents collection
            if (!existingCollections.includes(this.collections.oesterreich_gruene_documents)) {
                await this.client.createCollection(this.collections.oesterreich_gruene_documents, {
                    vectors: {
                        size: this.vectorSize,
                        distance: 'Cosine'
                    },
                    optimizers_config: {
                        default_segment_number: 2,
                        max_segment_size: 20000
                    }
                });
                log.debug(`Created oesterreich_gruene_documents collection (${this.vectorSize} dims)`);
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
                log.debug(`Created user_knowledge collection (${this.vectorSize} dims)`);
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
                log.debug(`Created content_examples collection (${this.vectorSize} dims)`);
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
                    log.debug(`Created social_media_examples collection (${this.vectorSize} dims, multitenancy)`);

                    // Create keyword index for platform field with tenant optimization
                    await this.client.createPayloadIndex(this.collections.social_media_examples, {
                        field_name: 'platform',
                        field_schema: {
                            type: 'keyword',
                            is_tenant: true  // Optimize storage for tenant-based access patterns
                        }
                    });
                    log.debug(`Created tenant-optimized index for platform field`);
                } catch (error) {
                    // Handle race condition - collection might have been created by another instance
                    if (error.message && error.message.includes('already exists')) {
                        log.debug(`Collection ${this.collections.social_media_examples} already exists (race condition)`);
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
                log.debug(`Created user_texts collection (${this.vectorSize} dims, user-scoped)`);

                // Create indexes for efficient filtering
                await this.client.createPayloadIndex(this.collections.user_texts, {
                    field_name: 'user_id',
                    field_schema: {
                        type: 'keyword',
                        is_tenant: true  // Optimize for user-based filtering
                    }
                });
                log.debug(`Created user_id tenant index for user_texts`);

                await this.client.createPayloadIndex(this.collections.user_texts, {
                    field_name: 'document_type',
                    field_schema: {
                        type: 'keyword'
                    }
                });
                log.debug(`Created document_type index for user_texts`);
                
                await this.client.createPayloadIndex(this.collections.user_texts, {
                    field_name: 'title',
                    field_schema: {
                        type: 'keyword'
                    }
                });
                log.debug(`Created title index for user_texts`);
            }

            // Notebook collections collection (metadata storage)
            if (!existingCollections.includes(this.collections.notebook_collections)) {
                await this.client.createCollection(this.collections.notebook_collections, {
                    vectors: {
                        size: this.vectorSize,
                        distance: 'Cosine'
                    },
                    optimizers_config: {
                        default_segment_number: 1,
                        max_segment_size: 5000
                    }
                });
                log.debug(`Created notebook_collections collection (${this.vectorSize} dims)`);

                // Create indexes for efficient filtering
                await this.client.createPayloadIndex(this.collections.notebook_collections, {
                    field_name: 'user_id',
                    field_schema: {
                        type: 'keyword',
                        is_tenant: true
                    }
                });

                await this.client.createPayloadIndex(this.collections.notebook_collections, {
                    field_name: 'collection_id',
                    field_schema: {
                        type: 'keyword'
                    }
                });
            }

            // Notebook collection documents junction collection
            if (!existingCollections.includes(this.collections.notebook_collection_documents)) {
                await this.client.createCollection(this.collections.notebook_collection_documents, {
                    vectors: {
                        size: this.vectorSize,
                        distance: 'Cosine'
                    },
                    optimizers_config: {
                        default_segment_number: 1,
                        max_segment_size: 5000
                    }
                });
                log.debug(`Created notebook_collection_documents collection (${this.vectorSize} dims)`);

                // Create indexes for efficient filtering
                await this.client.createPayloadIndex(this.collections.notebook_collection_documents, {
                    field_name: 'collection_id',
                    field_schema: {
                        type: 'keyword'
                    }
                });

                await this.client.createPayloadIndex(this.collections.notebook_collection_documents, {
                    field_name: 'document_id',
                    field_schema: {
                        type: 'keyword'
                    }
                });
            }

            // Notebook usage logs collection
            if (!existingCollections.includes(this.collections.notebook_usage_logs)) {
                await this.client.createCollection(this.collections.notebook_usage_logs, {
                    vectors: {
                        size: this.vectorSize,
                        distance: 'Cosine'
                    },
                    optimizers_config: {
                        default_segment_number: 1,
                        max_segment_size: 10000
                    }
                });
                log.debug(`Created notebook_usage_logs collection (${this.vectorSize} dims)`);

                // Create indexes for efficient filtering
                await this.client.createPayloadIndex(this.collections.notebook_usage_logs, {
                    field_name: 'collection_id',
                    field_schema: {
                        type: 'keyword'
                    }
                });

                await this.client.createPayloadIndex(this.collections.notebook_usage_logs, {
                    field_name: 'user_id',
                    field_schema: {
                        type: 'keyword'
                    }
                });
            }

            // Notebook public access collection
            if (!existingCollections.includes(this.collections.notebook_public_access)) {
                await this.client.createCollection(this.collections.notebook_public_access, {
                    vectors: {
                        size: this.vectorSize,
                        distance: 'Cosine'
                    },
                    optimizers_config: {
                        default_segment_number: 1,
                        max_segment_size: 1000
                    }
                });
                log.debug(`Created notebook_public_access collection (${this.vectorSize} dims)`);

                // Create indexes for efficient filtering
                await this.client.createPayloadIndex(this.collections.notebook_public_access, {
                    field_name: 'access_token',
                    field_schema: {
                        type: 'keyword'
                    }
                });

                await this.client.createPayloadIndex(this.collections.notebook_public_access, {
                    field_name: 'collection_id',
                    field_schema: {
                        type: 'keyword'
                    }
                });
            }

            // OParl papers collection (municipal green party motions)
            if (!existingCollections.includes(this.collections.oparl_papers)) {
                await this.client.createCollection(this.collections.oparl_papers, {
                    vectors: {
                        size: this.vectorSize,
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
                log.debug(`Created oparl_papers collection (${this.vectorSize} dims)`);

                // Create indexes for efficient filtering
                await this.client.createPayloadIndex(this.collections.oparl_papers, {
                    field_name: 'city',
                    field_schema: {
                        type: 'keyword',
                        is_tenant: true
                    }
                });

                await this.client.createPayloadIndex(this.collections.oparl_papers, {
                    field_name: 'paper_id',
                    field_schema: {
                        type: 'keyword'
                    }
                });

                await this.client.createPayloadIndex(this.collections.oparl_papers, {
                    field_name: 'oparl_id',
                    field_schema: {
                        type: 'keyword'
                    }
                });

                await this.client.createPayloadIndex(this.collections.oparl_papers, {
                    field_name: 'paper_type',
                    field_schema: {
                        type: 'keyword'
                    }
                });

                await this.client.createPayloadIndex(this.collections.oparl_papers, {
                    field_name: 'chunk_text',
                    field_schema: {
                        type: 'text',
                        tokenizer: 'word',
                        min_token_len: 2,
                        max_token_len: 50,
                        lowercase: true
                    }
                });
            }

            // Create text search indexes for hybrid search
            await this.createTextSearchIndexes();

        } catch (error) {
            log.error(`Failed to create collections: ${error.message}`);
            throw error;
        }
    }

    /**
     * Create text search indexes for hybrid search
     */
    async createTextSearchIndexes() {
        try {
            const collectionsToIndex = [
                this.collections.documents,
                this.collections.grundsatz_documents,
                this.collections.user_knowledge
            ];

            let indexedCount = 0;
            for (const collectionName of collectionsToIndex) {
                try {
                    await this.client.createPayloadIndex(collectionName, {
                        field_name: 'chunk_text',
                        field_schema: { type: 'text', tokenizer: 'word', min_token_len: 2, max_token_len: 50, lowercase: true }
                    });
                    await this.client.createPayloadIndex(collectionName, {
                        field_name: 'title',
                        field_schema: { type: 'keyword' }
                    });
                    await this.client.createPayloadIndex(collectionName, {
                        field_name: 'filename',
                        field_schema: { type: 'keyword' }
                    });
                    await this.client.createPayloadIndex(collectionName, {
                        field_name: 'user_id',
                        field_schema: { type: 'keyword', is_tenant: true }
                    });
                    indexedCount++;
                } catch (indexError) {
                    if (!indexError.message?.includes('already exists') && !indexError.message?.includes('index already created')) {
                        log.debug(`Index creation failed for ${collectionName}: ${indexError.message}`);
                    }
                }
            }

            if (indexedCount > 0) {
                log.debug(`Created indexes for ${indexedCount} collections`);
            }

        } catch (error) {
            log.debug(`Text search indexes error: ${error.message}`);
        }
    }

    /**
     * Index document chunks with vectors
     */
    async indexDocumentChunks(documentId, chunks, userId = null, collectionName = null) {
        this.ensureConnected();
        try {
            const points = chunks.map((chunk, index) => {
                return {
                    id: chunkToNumericId(documentId, index),
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

            log.debug(`Indexed ${chunks.length} chunks for document ${documentId}`);
            return { success: true, chunks: chunks.length };

        } catch (error) {
            log.error(`Failed to index document chunks: ${error.message}`);
            throw new Error(`Vector indexing failed: ${error.message}`);
        }
    }

    /**
     * Index grundsatz document chunks
     */
    async indexGrundsatzChunks(documentId, chunks) {
        this.ensureConnected();
        try {
            const points = chunks.map((chunk, index) => {
                return {
                    id: chunkToNumericId(documentId, index),
                    vector: chunk.embedding,
                    payload: {
                        document_id: documentId,
                        chunk_index: index,
                        chunk_text: chunk.text || chunk.chunk_text,
                        token_count: chunk.token_count || chunk.tokens,
                        content_type: chunk.metadata?.content_type,
                        page_number: (typeof chunk.metadata?.page_number === 'number') ? chunk.metadata.page_number : (index + 1),
                        title: chunk.metadata?.title || 'Grundsatzprogramm',
                        filename: chunk.metadata?.filename || '',
                        metadata: chunk.metadata || {},
                        document_type: 'grundsatz',
                        created_at: new Date().toISOString()
                    }
                };
            });

            await this.client.upsert(this.collections.grundsatz_documents, {
                points: points
            });

            log.debug(`Indexed ${chunks.length} grundsatz chunks for document ${documentId}`);
            return { success: true, chunks: chunks.length };

        } catch (error) {
            log.error(`Failed to index grundsatz chunks: ${error.message}`);
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
            log.error(`Vector search failed: ${error.message}`);
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

    // NOTE: hybridSearch and text search operations moved to QdrantOperations.js

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

            log.debug(`Deleted vectors for document ${documentId}`);
            return { success: true };

        } catch (error) {
            log.error(`Failed to delete document vectors: ${error.message}`);
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

            log.debug(`Deleted all vectors for user ${userId}`);
            return { success: true };

        } catch (error) {
            log.error(`Failed to delete user vectors: ${error.message}`);
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
            log.error(`Failed to get collection stats: ${error.message}`);
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
            log.error(`Failed to get all stats: ${error.message}`);
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
            log.debug(`Snapshot created: ${JSON.stringify(snapshot)}`);
            return snapshot;
        } catch (error) {
            log.error(`Failed to create snapshot: ${error.message}`);
            throw new Error(`Snapshot creation failed: ${error.message}`);
        }
    }

    /**
     * Check if Qdrant is available
     * This method waits for initialization to complete if it's in progress
     */
    async isAvailable() {
        // If already connected, return true immediately
        if (this.isConnected && this.client !== null) {
            return true;
        }
        
        // If initialization is in progress, wait for it to complete
        if (this.initPromise) {
            try {
                await this.initPromise;
                return this.isConnected && this.client !== null;
            } catch (error) {
                log.warn(`Initialization failed: ${error.message}`);
                return false;
            }
        }
        
        // If no initialization promise exists and we're not connected, 
        // try to start initialization
        if (!this.isInitializing) {
            log.debug('Starting deferred initialization...');
            this.initPromise = this._performInit();
            try {
                await this.initPromise;
                return this.isConnected && this.client !== null;
            } catch (error) {
                log.warn(`Initialization failed: ${error.message}`);
                return false;
            }
        }
        
        return false;
    }
    
    /**
     * Synchronous check if Qdrant appears to be available (for backwards compatibility)
     * Use isAvailable() for proper async checking
     */
    isAvailableSync() {
        return this.isConnected && this.client !== null;
    }

    /**
     * Ensure connection is available
     * This method waits for initialization if needed
     */
    async ensureConnected() {
        const available = await this.isAvailable();
        if (!available) {
            throw new Error('Qdrant is not available. Vector search functionality is disabled.');
        }
    }
    
    /**
     * Synchronous ensure connection (throws immediately if not connected)
     * Use ensureConnected() for proper async checking
     */
    ensureConnectedSync() {
        if (!this.isAvailableSync()) {
            throw new Error('Qdrant is not available. Vector search functionality is disabled.');
        }
    }

    /**
     * Index content examples
     */
    async indexContentExample(exampleId, embedding, metadata) {
        this.ensureConnected();
        try {
            const point = {
                id: stringToNumericId(exampleId),
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

            log.debug(`Indexed content example ${exampleId}`);
            return { success: true };

        } catch (error) {
            log.error(`Failed to index content example: ${error.message}`);
            throw new Error(`Content example indexing failed: ${error.message}`);
        }
    }

    /**
     * Search content examples using vector similarity
     */
    async searchContentExamples(queryVector, options = {}) {
        await this.ensureConnected();
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
            log.error(`Content examples search failed: ${error.message}`);
            throw new Error(`Content examples search failed: ${error.message}`);
        }
    }

    /**
     * Get random content examples from Qdrant
     */
    async getRandomContentExamples(options = {}) {
        await this.ensureConnected();
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
            log.error(`Random content examples failed: ${error.message}`);
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

            log.debug(`Deleted content example ${exampleId}`);
            return { success: true };

        } catch (error) {
            log.error(`Failed to delete content example: ${error.message}`);
            throw new Error(`Content example deletion failed: ${error.message}`);
        }
    }

    /**
     * Index social media example (Facebook or Instagram) with multitenancy
     * @param {string} exampleId - Unique example identifier
     * @param {Array<number>} embedding - 1024-dim embedding vector
     * @param {string} content - Post content/caption
     * @param {string} platform - 'facebook' or 'instagram'
     * @param {Object} metadata - Optional metadata (country, source_account, engagement)
     */
    async indexSocialMediaExample(exampleId, embedding, content, platform, metadata = {}) {
        this.ensureConnected();
        try {
            const payload = {
                example_id: exampleId,
                platform: platform,
                content: content,
                created_at: new Date().toISOString()
            };

            // Add optional metadata fields if provided
            if (metadata.country) {
                payload.country = metadata.country; // 'DE' or 'AT'
            }
            if (metadata.source_account) {
                payload.source_account = metadata.source_account;
            }
            if (metadata.engagement) {
                payload.engagement = metadata.engagement;
            }

            const point = {
                id: stringToNumericId(exampleId),
                vector: embedding,
                payload: payload
            };

            await this.client.upsert(this.collections.social_media_examples, {
                points: [point]
            });

            const countryInfo = metadata.country ? ` (${metadata.country})` : '';
            log.debug(`Indexed ${platform} example ${exampleId}${countryInfo}`);
            return { success: true };

        } catch (error) {
            log.error(`Failed to index ${platform} example: ${error.message}`);
            throw new Error(`${platform} example indexing failed: ${error.message}`);
        }
    }

    /**
     * Search social media examples with platform and country filtering (multitenancy)
     * @param {Array<number>} queryVector - Query embedding vector
     * @param {Object} options - Search options
     * @param {string} options.platform - 'facebook', 'instagram', or null for all
     * @param {string} options.country - 'DE', 'AT', or null for all countries
     * @param {number} options.limit - Max results to return
     * @param {number} options.threshold - Minimum similarity score
     */
    async searchSocialMediaExamples(queryVector, options = {}) {
        await this.ensureConnected();
        try {
            const {
                platform = null,
                country = null,
                limit = 10,
                threshold = 0.3
            } = options;

            // Build filter for platform and country filtering
            const mustConditions = [];
            if (platform) {
                mustConditions.push({ key: 'platform', match: { value: platform } });
            }
            if (country) {
                mustConditions.push({ key: 'country', match: { value: country } });
            }
            const filter = mustConditions.length > 0 ? { must: mustConditions } : undefined;

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

            const results = searchResult.map(hit => {
                // Try different possible content fields
                let content = hit.payload.content;
                if (!content && hit.payload.content_data?.content) {
                    content = hit.payload.content_data.content;
                }
                if (!content && hit.payload.content_data?.caption) {
                    content = hit.payload.content_data.caption;
                }
                if (!content && hit.payload.text) {
                    content = hit.payload.text;
                }
                if (!content && hit.payload.caption) {
                    content = hit.payload.caption;
                }
                
                return {
                    id: hit.payload.example_id || hit.id,
                    score: hit.score,
                    content: content,
                    platform: hit.payload.platform,
                    country: hit.payload.country || null,
                    source_account: hit.payload.source_account || null,
                    created_at: hit.payload.created_at,
                    _debug_payload: hit.payload
                };
            });

            return {
                success: true,
                results: results,
                total: results.length
            };

        } catch (error) {
            log.error(`Social media search failed: ${error.message}`);
            throw new Error(`Social media search failed: ${error.message}`);
        }
    }

    /**
     * Search Facebook examples (convenience method)
     * @param {Array<number>} queryVector - Query embedding
     * @param {Object} options - Options including country filter
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
     * Get random social media examples with platform and country filtering
     * Uses proper random sampling with scroll API for true randomness
     * @param {Object} options - Filter options
     * @param {string} options.platform - 'facebook', 'instagram', or null for all
     * @param {string} options.country - 'DE', 'AT', or null for all countries
     * @param {number} options.limit - Max results to return
     */
    async getRandomSocialMediaExamples(options = {}) {
        await this.ensureConnected();
        try {
            const {
                platform = null,
                country = null,
                limit = 10
            } = options;

            // Build filter for platform and country if specified
            const mustConditions = [];
            if (platform) {
                mustConditions.push({ key: 'platform', match: { value: platform } });
            }
            if (country) {
                mustConditions.push({ key: 'country', match: { value: country } });
            }
            const filter = mustConditions.length > 0 ? { must: mustConditions } : undefined;

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

            const results = finalResults.map(point => {
                // Try different possible content fields
                let content = point.payload.content;
                if (!content && point.payload.content_data?.content) {
                    content = point.payload.content_data.content;
                }
                if (!content && point.payload.content_data?.caption) {
                    content = point.payload.content_data.caption;
                }
                if (!content && point.payload.text) {
                    content = point.payload.text;
                }
                if (!content && point.payload.caption) {
                    content = point.payload.caption;
                }
                
                return {
                    id: point.payload.example_id || point.id,
                    content: content,
                    platform: point.payload.platform,
                    country: point.payload.country || null,
                    source_account: point.payload.source_account || null,
                    created_at: point.payload.created_at,
                    _debug_payload: point.payload
                };
            });

            return {
                success: true,
                results: results,
                total: results.length
            };

        } catch (error) {
            log.error(`Random social media examples failed: ${error.message}`);
            throw new Error(`Random social media examples failed: ${error.message}`);
        }
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

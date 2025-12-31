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
dotenv.config({ quiet: true });

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
            oparl_papers: 'oparl_papers',
            kommunalwiki_documents: 'kommunalwiki_documents',
            bundestag_content: 'bundestag_content',
            gruene_de_documents: 'gruene_de_documents',
            gruene_at_documents: 'gruene_at_documents'
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
     * Create all required collections using schema configuration
     */
    async createCollections() {
        try {
            const collections = await this.client.getCollections();
            const existingNames = new Set(collections.collections.map(c => c.name));

            for (const [key, schema] of Object.entries(COLLECTION_SCHEMAS)) {
                if (existingNames.has(schema.name)) continue;

                try {
                    const config = getCollectionConfig(this.vectorSize, schema);
                    await this.client.createCollection(schema.name, config);
                    log.debug(`Created ${schema.name} collection (${this.vectorSize} dims)`);

                    // Create indexes for this collection
                    for (const index of schema.indexes || []) {
                        await this.client.createPayloadIndex(schema.name, {
                            field_name: index.field,
                            field_schema: getIndexSchema(index.type)
                        });
                    }
                } catch (error) {
                    if (schema.handleRaceCondition && error.message?.includes('already exists')) {
                        log.debug(`Collection ${schema.name} already exists (race condition)`);
                    } else {
                        throw error;
                    }
                }
            }

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
        let indexedCount = 0;
        for (const collectionName of TEXT_SEARCH_COLLECTIONS) {
            const fullName = this.collections[collectionName];
            for (const index of TEXT_SEARCH_INDEXES) {
                try {
                    await this.client.createPayloadIndex(fullName, {
                        field_name: index.field,
                        field_schema: getIndexSchema(index.type)
                    });
                } catch (indexError) {
                    if (!indexError.message?.includes('already exists')) {
                        log.debug(`Index creation failed for ${fullName}.${index.field}: ${indexError.message}`);
                    }
                }
            }
            indexedCount++;
        }
        if (indexedCount > 0) {
            log.debug(`Created text search indexes for ${indexedCount} collections`);
        }
    }

    /**
     * Index document chunks with vectors
     */
    async indexDocumentChunks(documentId, chunks, userId = null, collectionName = null) {
        this.ensureConnected();
        try {
            const points = chunks.map((chunk, index) => {
                const chunkIdx = chunk.chunk_index ?? index;
                return {
                    id: chunkToNumericId(documentId, chunkIdx),
                    vector: chunk.embedding,
                    payload: {
                        document_id: documentId,
                        chunk_index: chunkIdx,
                        chunk_text: chunk.text || chunk.chunk_text,
                        token_count: chunk.token_count || chunk.tokens,
                        user_id: userId,
                        title: chunk.title || chunk.metadata?.title || null,
                        filename: chunk.filename || chunk.metadata?.filename || null,
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

    /**
     * Index bundestag content chunks
     * @param {string} url - Source URL
     * @param {Array} chunks - Processed chunks with embeddings
     * @param {Object} metadata - Page metadata (title, primary_category, published_at, content_hash)
     */
    async indexBundestagContent(url, chunks, metadata = {}) {
        this.ensureConnected();
        try {
            const points = chunks.map((chunk, index) => ({
                id: chunkToNumericId(url, index),
                vector: chunk.embedding,
                payload: {
                    source_url: url,
                    chunk_index: index,
                    chunk_text: chunk.text || chunk.chunk_text,
                    token_count: chunk.token_count || chunk.tokens,
                    title: metadata.title || null,
                    primary_category: metadata.primary_category || metadata.section || null,
                    published_at: metadata.published_at || null,
                    content_hash: metadata.content_hash || null,
                    country: 'DE',
                    indexed_at: new Date().toISOString()
                }
            }));

            await this.client.upsert(this.collections.bundestag_content, {
                points: points
            });

            log.debug(`Indexed ${chunks.length} chunks for bundestag URL: ${url}`);
            return { success: true, chunks: chunks.length };

        } catch (error) {
            log.error(`Failed to index bundestag content: ${error.message}`);
            throw new Error(`Bundestag indexing failed: ${error.message}`);
        }
    }

    /**
     * Get all indexed bundestag URLs for deduplication
     * @returns {Array} Array of {source_url, content_hash} objects
     */
    async getAllBundestagUrls() {
        this.ensureConnected();
        try {
            const urlMap = new Map();
            let offset = null;

            while (true) {
                const scrollResult = await this.client.scroll(this.collections.bundestag_content, {
                    limit: 100,
                    offset: offset,
                    with_payload: ['source_url', 'content_hash', 'chunk_index'],
                    with_vector: false
                });

                if (!scrollResult.points || scrollResult.points.length === 0) {
                    break;
                }

                for (const point of scrollResult.points) {
                    if (point.payload.chunk_index === 0) {
                        const url = point.payload.source_url || point.payload.url;
                        urlMap.set(url, {
                            source_url: url,
                            content_hash: point.payload.content_hash
                        });
                    }
                }

                offset = scrollResult.next_page_offset;
                if (!offset) break;
            }

            return Array.from(urlMap.values());
        } catch (error) {
            if (error.message?.includes('doesn\'t exist')) {
                return [];
            }
            log.error(`Failed to get bundestag URLs: ${error.message}`);
            throw error;
        }
    }

    /**
     * Delete bundestag content by URL (for updates)
     */
    async deleteBundestagContentByUrl(url) {
        this.ensureConnected();
        try {
            await this.client.delete(this.collections.bundestag_content, {
                filter: {
                    must: [{ key: 'source_url', match: { value: url } }]
                }
            });

            log.debug(`Deleted bundestag content for URL: ${url}`);
            return { success: true };

        } catch (error) {
            log.error(`Failed to delete bundestag content: ${error.message}`);
            throw new Error(`Bundestag deletion failed: ${error.message}`);
        }
    }

    /**
     * Search bundestag documents
     */
    async searchBundestagDocuments(queryVector, options = {}) {
        return await this.searchDocuments(queryVector, {
            ...options,
            collection: this.collections.bundestag_content
        });
    }

    /**
     * Index gruene.de content chunks
     * @param {string} url - Source URL
     * @param {Array} chunks - Processed chunks with embeddings
     * @param {Object} metadata - Page metadata (title, primary_category, published_at, content_hash)
     */
    async indexGrueneDeContent(url, chunks, metadata = {}) {
        this.ensureConnected();
        try {
            const urlId = stringToNumericId(url);
            const points = chunks.map((chunk, index) => ({
                id: chunkToNumericId(url, index),
                vector: chunk.embedding,
                payload: {
                    source_url: url,
                    chunk_index: index,
                    chunk_text: chunk.text || chunk.chunk_text,
                    token_count: chunk.token_count || chunk.tokens,
                    title: metadata.title || null,
                    primary_category: metadata.primary_category || metadata.section || null,
                    published_at: metadata.published_at || null,
                    content_hash: metadata.content_hash || null,
                    country: 'DE',
                    indexed_at: new Date().toISOString()
                }
            }));

            await this.client.upsert(this.collections.gruene_de_documents, {
                points: points
            });

            log.debug(`Indexed ${chunks.length} chunks for gruene.de URL: ${url}`);
            return { success: true, chunks: chunks.length };

        } catch (error) {
            log.error(`Failed to index gruene.de content: ${error.message}`);
            throw new Error(`gruene.de indexing failed: ${error.message}`);
        }
    }

    /**
     * Get all indexed gruene.de URLs for deduplication
     * @returns {Array} Array of {source_url, content_hash} objects
     */
    async getAllGrueneDeUrls() {
        this.ensureConnected();
        try {
            const urlMap = new Map();
            let offset = null;

            while (true) {
                const scrollResult = await this.client.scroll(this.collections.gruene_de_documents, {
                    limit: 100,
                    offset: offset,
                    with_payload: ['source_url', 'content_hash', 'chunk_index'],
                    with_vector: false
                });

                if (!scrollResult.points || scrollResult.points.length === 0) {
                    break;
                }

                for (const point of scrollResult.points) {
                    if (point.payload.chunk_index === 0) {
                        const url = point.payload.source_url || point.payload.url;
                        urlMap.set(url, {
                            source_url: url,
                            content_hash: point.payload.content_hash
                        });
                    }
                }

                offset = scrollResult.next_page_offset;
                if (!offset) break;
            }

            return Array.from(urlMap.values());
        } catch (error) {
            if (error.message?.includes('doesn\'t exist')) {
                return [];
            }
            log.error(`Failed to get gruene.de URLs: ${error.message}`);
            throw error;
        }
    }

    /**
     * Delete gruene.de content by URL (for updates)
     */
    async deleteGrueneDeContentByUrl(url) {
        this.ensureConnected();
        try {
            await this.client.delete(this.collections.gruene_de_documents, {
                filter: {
                    must: [{ key: 'source_url', match: { value: url } }]
                }
            });

            log.debug(`Deleted gruene.de content for URL: ${url}`);
            return { success: true };

        } catch (error) {
            log.error(`Failed to delete gruene.de content: ${error.message}`);
            throw new Error(`gruene.de deletion failed: ${error.message}`);
        }
    }

    /**
     * Search gruene.de documents
     */
    async searchGrueneDeDocuments(queryVector, options = {}) {
        return await this.searchDocuments(queryVector, {
            ...options,
            collection: this.collections.gruene_de_documents
        });
    }

    /**
     * Index gruene.at content chunks
     * @param {string} url - Source URL
     * @param {Array} chunks - Processed chunks with embeddings
     * @param {Object} metadata - Page metadata (title, primary_category, published_at, content_hash)
     */
    async indexGrueneAtContent(url, chunks, metadata = {}) {
        this.ensureConnected();
        try {
            const points = chunks.map((chunk, index) => ({
                id: chunkToNumericId(url, index),
                vector: chunk.embedding,
                payload: {
                    source_url: url,
                    chunk_index: index,
                    chunk_text: chunk.text || chunk.chunk_text,
                    token_count: chunk.token_count || chunk.tokens,
                    title: metadata.title || null,
                    primary_category: metadata.primary_category || metadata.section || null,
                    published_at: metadata.published_at || null,
                    content_hash: metadata.content_hash || null,
                    country: 'AT',
                    indexed_at: new Date().toISOString()
                }
            }));

            await this.client.upsert(this.collections.gruene_at_documents, {
                points: points
            });

            log.debug(`Indexed ${chunks.length} chunks for gruene.at URL: ${url}`);
            return { success: true, chunks: chunks.length };

        } catch (error) {
            log.error(`Failed to index gruene.at content: ${error.message}`);
            throw new Error(`gruene.at indexing failed: ${error.message}`);
        }
    }

    /**
     * Get all indexed gruene.at URLs for deduplication
     * @returns {Array} Array of {source_url, content_hash} objects
     */
    async getAllGrueneAtUrls() {
        this.ensureConnected();
        try {
            const urlMap = new Map();
            let offset = null;

            while (true) {
                const scrollResult = await this.client.scroll(this.collections.gruene_at_documents, {
                    limit: 100,
                    offset: offset,
                    with_payload: ['source_url', 'content_hash', 'chunk_index'],
                    with_vector: false
                });

                if (!scrollResult.points || scrollResult.points.length === 0) {
                    break;
                }

                for (const point of scrollResult.points) {
                    if (point.payload.chunk_index === 0) {
                        const url = point.payload.source_url || point.payload.url;
                        urlMap.set(url, {
                            source_url: url,
                            content_hash: point.payload.content_hash
                        });
                    }
                }

                offset = scrollResult.next_page_offset;
                if (!offset) break;
            }

            return Array.from(urlMap.values());
        } catch (error) {
            if (error.message?.includes('doesn\'t exist')) {
                return [];
            }
            log.error(`Failed to get gruene.at URLs: ${error.message}`);
            throw error;
        }
    }

    /**
     * Delete gruene.at content by URL (for updates)
     */
    async deleteGrueneAtContentByUrl(url) {
        this.ensureConnected();
        try {
            await this.client.delete(this.collections.gruene_at_documents, {
                filter: {
                    must: [{ key: 'source_url', match: { value: url } }]
                }
            });

            log.debug(`Deleted gruene.at content for URL: ${url}`);
            return { success: true };

        } catch (error) {
            log.error(`Failed to delete gruene.at content: ${error.message}`);
            throw new Error(`gruene.at deletion failed: ${error.message}`);
        }
    }

    /**
     * Search gruene.at documents
     */
    async searchGrueneAtDocuments(queryVector, options = {}) {
        return await this.searchDocuments(queryVector, {
            ...options,
            collection: this.collections.gruene_at_documents
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
     * Extract content from multiple possible payload fields (legacy data support)
     * @private
     */
    _extractMultiFieldContent(payload) {
        let content = payload.content;
        if (!content && payload.content_data?.content) content = payload.content_data.content;
        if (!content && payload.content_data?.caption) content = payload.content_data.caption;
        if (!content && payload.text) content = payload.text;
        if (!content && payload.caption) content = payload.caption;
        return content;
    }

    /**
     * Calculate random offset for scroll-based random sampling
     * @private
     */
    _calculateRandomOffset(totalPoints, limit) {
        const maxOffset = Math.max(0, totalPoints - limit);
        return Math.floor(Math.random() * (maxOffset + 1));
    }

    /**
     * Shuffle array and limit to specified count
     * @private
     */
    _shuffleAndLimit(points, limit) {
        return points.sort(() => Math.random() - 0.5).slice(0, limit);
    }

    /**
     * Build filter for content example queries
     * @private
     */
    _buildContentExampleFilter(options) {
        const filter = { must: [] };
        if (options.contentType) {
            filter.must.push({ key: 'type', match: { value: options.contentType } });
        }
        if (options.categories?.length) {
            filter.must.push({ key: 'categories', match: { any: options.categories } });
        }
        if (options.tags?.length) {
            filter.must.push({ key: 'tags', match: { any: options.tags } });
        }
        return filter.must.length > 0 ? filter : undefined;
    }

    /**
     * Build filter for social media example queries
     * @private
     */
    _buildSocialMediaFilter(options) {
        const must = [];
        if (options.platform) {
            must.push({ key: 'platform', match: { value: options.platform } });
        }
        if (options.country) {
            must.push({ key: 'country', match: { value: options.country } });
        }
        return must.length > 0 ? { must } : undefined;
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
            const { limit = 10, threshold = 0.3 } = options;
            const filter = this._buildContentExampleFilter(options);

            const searchResult = await this.client.search(this.collections.content_examples, {
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
            const { limit = 10 } = options;
            const filter = this._buildContentExampleFilter(options);

            const countResult = await this.client.count(this.collections.content_examples, {
                filter: filter,
                exact: true
            });

            const totalPoints = countResult.count;
            if (totalPoints === 0) {
                return { success: true, results: [], total: 0 };
            }

            const randomOffset = this._calculateRandomOffset(totalPoints, limit);

            const scrollResult = await this.client.scroll(this.collections.content_examples, {
                filter: filter,
                limit: Math.min(limit * 2, totalPoints),
                offset: randomOffset,
                with_payload: true,
                with_vector: false
            });

            if (!scrollResult.points?.length) {
                return { success: true, results: [], total: 0 };
            }

            const finalResults = this._shuffleAndLimit(scrollResult.points, limit);

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
     */
    async searchSocialMediaExamples(queryVector, options = {}) {
        await this.ensureConnected();
        try {
            const { limit = 10, threshold = 0.3 } = options;
            const filter = this._buildSocialMediaFilter(options);

            const searchResult = await this.client.search(this.collections.social_media_examples, {
                vector: queryVector,
                filter: filter,
                limit: limit,
                score_threshold: threshold,
                with_payload: true,
                params: {
                    ef: Math.max(100, limit * 2)
                }
            });

            const results = searchResult.map(hit => ({
                id: hit.payload.example_id || hit.id,
                score: hit.score,
                content: this._extractMultiFieldContent(hit.payload),
                platform: hit.payload.platform,
                country: hit.payload.country || null,
                source_account: hit.payload.source_account || null,
                created_at: hit.payload.created_at,
                _debug_payload: hit.payload
            }));

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
     */
    async getRandomSocialMediaExamples(options = {}) {
        await this.ensureConnected();
        try {
            const { limit = 10 } = options;
            const filter = this._buildSocialMediaFilter(options);

            const countResult = await this.client.count(this.collections.social_media_examples, {
                filter: filter,
                exact: true
            });

            const totalPoints = countResult.count;
            if (totalPoints === 0) {
                return { success: true, results: [], total: 0 };
            }

            const randomOffset = this._calculateRandomOffset(totalPoints, limit);

            const scrollResult = await this.client.scroll(this.collections.social_media_examples, {
                filter: filter,
                limit: Math.min(limit * 2, totalPoints),
                offset: randomOffset,
                with_payload: true,
                with_vector: false
            });

            if (!scrollResult.points?.length) {
                return { success: true, results: [], total: 0 };
            }

            const finalResults = this._shuffleAndLimit(scrollResult.points, limit);

            const results = finalResults.map(point => ({
                id: point.payload.example_id || point.id,
                content: this._extractMultiFieldContent(point.payload),
                platform: point.payload.platform,
                country: point.payload.country || null,
                source_account: point.payload.source_account || null,
                created_at: point.payload.created_at,
                _debug_payload: point.payload
            }));

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

    /**
     * Get unique values for a field in a collection
     * @param {string} collectionName - Name of the collection
     * @param {string} fieldName - Field to extract unique values from
     * @param {number} maxValues - Maximum number of unique values to return
     * @returns {Promise<string[]>} Array of unique values
     */
    async getUniqueFieldValues(collectionName, fieldName, maxValues = 50) {
        this.ensureConnected();
        try {
            const uniqueValues = new Set();
            let offset = null;
            let iterations = 0;
            const maxIterations = 50;

            while (iterations < maxIterations && uniqueValues.size < maxValues) {
                const scrollResult = await this.client.scroll(collectionName, {
                    limit: 100,
                    offset: offset,
                    with_payload: [fieldName],
                    with_vector: false
                });

                if (!scrollResult.points || scrollResult.points.length === 0) {
                    break;
                }

                for (const point of scrollResult.points) {
                    const value = point.payload?.[fieldName];
                    if (value !== undefined && value !== null && value !== '') {
                        if (Array.isArray(value)) {
                            for (const v of value) {
                                if (v && uniqueValues.size < maxValues) {
                                    uniqueValues.add(String(v));
                                }
                            }
                        } else {
                            uniqueValues.add(String(value));
                        }
                    }
                    if (uniqueValues.size >= maxValues) break;
                }

                offset = scrollResult.next_page_offset;
                if (!offset) break;
                iterations++;
            }

            return Array.from(uniqueValues).sort();
        } catch (error) {
            if (error.message?.includes("doesn't exist")) {
                return [];
            }
            log.error(`Failed to get unique values for ${fieldName} in ${collectionName}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get unique field values with document counts for faceted search
     * @param {string} collectionName - The collection to query
     * @param {string} fieldName - The field to get values for
     * @param {number} maxValues - Maximum number of values to return (default 50)
     * @param {Object} baseFilter - Optional base filter to apply
     * @returns {Promise<Array<{value: string, count: number}>>} Array of values with counts, sorted by count descending
     */
    async getFieldValueCounts(collectionName, fieldName, maxValues = 50, baseFilter = null) {
        this.ensureConnected();
        try {
            const valueCounts = new Map();
            let offset = null;
            let iterations = 0;
            const maxIterations = 100;

            while (iterations < maxIterations) {
                const scrollOptions = {
                    limit: 100,
                    offset: offset,
                    with_payload: [fieldName],
                    with_vector: false
                };

                if (baseFilter) {
                    scrollOptions.filter = baseFilter;
                }

                const scrollResult = await this.client.scroll(collectionName, scrollOptions);

                if (!scrollResult.points || scrollResult.points.length === 0) {
                    break;
                }

                for (const point of scrollResult.points) {
                    const value = point.payload?.[fieldName];
                    if (value !== undefined && value !== null && value !== '') {
                        if (Array.isArray(value)) {
                            for (const v of value) {
                                if (v) {
                                    const strValue = String(v);
                                    valueCounts.set(strValue, (valueCounts.get(strValue) || 0) + 1);
                                }
                            }
                        } else {
                            const strValue = String(value);
                            valueCounts.set(strValue, (valueCounts.get(strValue) || 0) + 1);
                        }
                    }
                }

                offset = scrollResult.next_page_offset;
                if (!offset) break;
                iterations++;
            }

            return [...valueCounts.entries()]
                .map(([value, count]) => ({ value, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, maxValues);
        } catch (error) {
            if (error.message?.includes("doesn't exist")) {
                return [];
            }
            log.error(`Failed to get field value counts for ${fieldName} in ${collectionName}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get date range (min/max) for a date field
     * @param {string} collectionName - The collection to query
     * @param {string} fieldName - The date field to analyze
     * @returns {Promise<{min: string|null, max: string|null}>} Min and max date values
     */
    async getDateRange(collectionName, fieldName) {
        this.ensureConnected();
        try {
            let minDate = null;
            let maxDate = null;
            let offset = null;
            let iterations = 0;
            const maxIterations = 50;

            while (iterations < maxIterations) {
                const scrollResult = await this.client.scroll(collectionName, {
                    limit: 100,
                    offset: offset,
                    with_payload: [fieldName],
                    with_vector: false
                });

                if (!scrollResult.points || scrollResult.points.length === 0) {
                    break;
                }

                for (const point of scrollResult.points) {
                    const value = point.payload?.[fieldName];
                    if (value) {
                        const dateStr = String(value);
                        if (!minDate || dateStr < minDate) minDate = dateStr;
                        if (!maxDate || dateStr > maxDate) maxDate = dateStr;
                    }
                }

                offset = scrollResult.next_page_offset;
                if (!offset) break;
                iterations++;
            }

            return { min: minDate, max: maxDate };
        } catch (error) {
            if (error.message?.includes("doesn't exist")) {
                return { min: null, max: null };
            }
            log.error(`Failed to get date range for ${fieldName} in ${collectionName}: ${error.message}`);
            throw error;
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

/**
 * SearchCore - Unified search interface with Express middleware
 * Provides single entry point for all search operations
 */

import { InputValidator, ValidationError } from '../utils/inputValidation.js';
import { keywordExtractor } from './keywordExtractor.js';

/**
 * Express middleware chain for search operations
 */
export const searchMiddleware = {
    /**
     * Validate search query parameters
     */
    validateQuery: (req, res, next) => {
        try {
            const { query, user_id, limit, threshold } = req.body;
            
            // Basic validation
            if (!query || typeof query !== 'string' || query.trim().length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Query parameter is required and must be a non-empty string'
                });
            }

            if (!user_id) {
                return res.status(400).json({
                    success: false,
                    error: 'User ID is required'
                });
            }

            // Validate using existing InputValidator
            const validated = InputValidator.validateSearchParams({
                query: query.trim(),
                user_id,
                limit: limit || 5,
                threshold: threshold || null
            });

            req.searchParams = validated;
            next();

        } catch (error) {
            if (error instanceof ValidationError) {
                return res.status(400).json({
                    success: false,
                    error: error.message,
                    code: error.code
                });
            }
            
            console.error('[SearchMiddleware] Validation error:', error);
            return res.status(500).json({
                success: false,
                error: 'Query validation failed'
            });
        }
    },

    /**
     * Enrich query with keyword extraction and language detection
     */
    enrichQuery: (req, res, next) => {
        try {
            const { query } = req.searchParams;
            
            // Extract keywords and language information
            const keywordData = keywordExtractor.extractKeywords(query);
            
            req.searchParams.enrichment = {
                keywords: keywordData.keywords,
                phrases: keywordData.phrases,
                language: keywordData.metadata.language,
                queryLength: keywordData.metadata.queryLength,
                complexity: keywordData.metadata.totalKeywords + keywordData.metadata.totalPhrases
            };

            // Generate search patterns for hybrid search
            if (req.searchParams.mode === 'hybrid') {
                req.searchParams.searchPatterns = keywordExtractor.generateSearchPatterns(query);
            }

            console.log(`[SearchMiddleware] Enriched query: "${query}" (${keywordData.metadata.language}, ${keywordData.metadata.totalKeywords} keywords)`);
            next();

        } catch (error) {
            console.error('[SearchMiddleware] Query enrichment error:', error);
            // Don't fail the request, just continue without enrichment
            req.searchParams.enrichment = {
                keywords: [],
                phrases: [],
                language: 'unknown',
                queryLength: 0,
                complexity: 0
            };
            next();
        }
    },

    /**
     * Execute search using appropriate service
     */
    executeSearch: async (req, res, next) => {
        try {
            const searchCore = req.app.locals.searchCore;
            
            if (!searchCore) {
                return res.status(500).json({
                    success: false,
                    error: 'Search service not initialized'
                });
            }

            // Determine search type from route or body
            const searchType = req.body.type || req.params.type || 'document';
            
            // Execute search
            const startTime = Date.now();
            const searchResult = await searchCore.search(searchType, req.searchParams);
            const duration = Date.now() - startTime;

            // Add timing and metadata
            searchResult.metadata = {
                ...searchResult.metadata,
                searchType,
                duration,
                enrichment: req.searchParams.enrichment
            };

            req.searchResults = searchResult;
            next();

        } catch (error) {
            console.error('[SearchMiddleware] Search execution error:', error);
            return res.status(500).json({
                success: false,
                error: 'Search execution failed',
                message: error.message
            });
        }
    },

    /**
     * Format and send response
     */
    formatResponse: (req, res) => {
        try {
            const result = req.searchResults;
            
            if (!result) {
                return res.status(500).json({
                    success: false,
                    error: 'No search results available'
                });
            }

            // Add standard response headers
            res.setHeader('Content-Type', 'application/json');
            
            // Log successful search
            console.log(`[SearchMiddleware] Search completed: ${result.results?.length || 0} results in ${result.metadata?.duration || 0}ms`);
            
            // Send response
            res.json(result);

        } catch (error) {
            console.error('[SearchMiddleware] Response formatting error:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to format search response'
            });
        }
    }
};

/**
 * Unified search interface that routes to appropriate services
 */
export class SearchCore {
    constructor(services = {}) {
        this.services = services;
        this.defaultLimits = {
            document: 10,
            grundsatz: 5,
            content: 8
        };
    }

    /**
     * Register a search service
     * @param {string} type - Search type identifier
     * @param {Object} service - Search service instance
     */
    registerService(type, service) {
        this.services[type] = service;
        console.log(`[SearchCore] Registered ${type} search service`);
    }

    /**
     * Main search method - routes to appropriate service
     * @param {string} type - Search type (document, grundsatz, etc.)
     * @param {Object} params - Search parameters
     * @returns {Promise<Object>} Search results
     */
    async search(type, params) {
        const service = this.services[type];
        
        if (!service) {
            throw new Error(`Search service not found for type: ${type}`);
        }

        // Apply default limit if not specified
        if (!params.limit && this.defaultLimits[type]) {
            params.limit = this.defaultLimits[type];
        }

        try {
            console.log(`[SearchCore] Executing ${type} search: "${params.query}"`);
            
            // Route to appropriate service method
            if (params.mode === 'hybrid' && typeof service.hybridSearch === 'function') {
                return await service.hybridSearch(params.query, params.user_id, {
                    limit: params.limit,
                    threshold: params.threshold,
                    documentIds: params.documentIds,
                    ...params.enrichment
                });
            } else if (typeof service.search === 'function') {
                return await service.search(params);
            } else {
                throw new Error(`Service ${type} does not implement required search methods`);
            }

        } catch (error) {
            console.error(`[SearchCore] ${type} search failed:`, error);
            
            return {
                success: false,
                error: error.message,
                results: [],
                query: params.query?.trim() || '',
                searchType: `${type}_error`,
                metadata: {
                    searchService: type,
                    errorCode: error.code || 'SEARCH_ERROR'
                }
            };
        }
    }

    /**
     * Semantic search (vector-based)
     * @param {Object} params - Search parameters
     * @returns {Promise<Object>} Search results
     */
    async semanticSearch(params) {
        return this.search('document', { ...params, mode: 'vector' });
    }

    /**
     * Hybrid search (vector + keyword)
     * @param {Object} params - Search parameters  
     * @returns {Promise<Object>} Search results
     */
    async hybridSearch(params) {
        return this.search('document', { ...params, mode: 'hybrid' });
    }

    /**
     * Grundsatz-specific search
     * @param {Object} params - Search parameters
     * @returns {Promise<Object>} Search results
     */
    async grundsatzSearch(params) {
        return this.search('grundsatz', params);
    }

    /**
     * Content examples search
     * @param {Object} params - Search parameters
     * @returns {Promise<Object>} Search results  
     */
    async contentSearch(params) {
        return this.search('content', params);
    }

    /**
     * Get statistics for all registered services
     * @returns {Promise<Object>} Service statistics
     */
    async getStats() {
        const stats = {
            registeredServices: Object.keys(this.services),
            timestamp: new Date().toISOString()
        };

        // Collect stats from each service
        for (const [type, service] of Object.entries(this.services)) {
            try {
                if (typeof service.getStats === 'function') {
                    stats[type] = await service.getStats();
                } else if (typeof service.getDocumentStats === 'function') {
                    stats[type] = await service.getDocumentStats();
                } else {
                    stats[type] = { status: 'available', methods: Object.getOwnPropertyNames(Object.getPrototypeOf(service)) };
                }
            } catch (error) {
                stats[type] = { status: 'error', error: error.message };
            }
        }

        return stats;
    }

    /**
     * Health check for all services
     * @returns {Promise<Object>} Health status
     */
    async healthCheck() {
        const health = {
            overall: 'healthy',
            services: {},
            timestamp: new Date().toISOString()
        };

        let hasUnhealthyService = false;

        for (const [type, service] of Object.entries(this.services)) {
            try {
                if (typeof service.isReady === 'function') {
                    const isReady = await service.isReady();
                    health.services[type] = { status: isReady ? 'healthy' : 'unhealthy' };
                    if (!isReady) hasUnhealthyService = true;
                } else {
                    health.services[type] = { status: 'unknown' };
                }
            } catch (error) {
                health.services[type] = { status: 'error', error: error.message };
                hasUnhealthyService = true;
            }
        }

        if (hasUnhealthyService) {
            health.overall = 'degraded';
        }

        return health;
    }
}

/**
 * Error handling middleware for search operations
 */
export const searchErrorHandler = (err, req, res, next) => {
    console.error('[SearchCore] Unhandled error:', err);

    if (err instanceof ValidationError) {
        return res.status(400).json({
            success: false,
            error: err.message,
            code: err.code
        });
    }

    if (err.name === 'SearchError') {
        return res.status(400).json({
            success: false,
            error: err.message,
            code: err.code || 'SEARCH_ERROR'
        });
    }

    // Generic error response
    return res.status(500).json({
        success: false,
        error: 'Internal search error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
};

// Export default instance for convenience
export const searchCore = new SearchCore();
export default SearchCore;
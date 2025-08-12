/**
 * Base Search Service - Eliminates code duplication across search services
 * 
 * This class provides common functionality for vector similarity search,
 * document chunking, result ranking, and caching that was duplicated
 * across multiple search implementations.
 */

import { supabaseService } from '../utils/supabaseClient.js';
import { embeddingService } from './embeddingService.js';
import { InputValidator, ValidationError } from '../utils/inputValidation.js';
import { createCache } from '../utils/lruCache.js';
import { SearchError, DatabaseError, createErrorHandler } from '../utils/errorHandling.js';
import { vectorConfig } from '../config/vectorConfig.js';

/**
 * Base search service providing common search functionality
 */
class BaseSearchService {
  constructor(options = {}) {
    this.serviceName = options.serviceName || 'BaseSearch';
    
    // Use centralized configuration with option overrides
    const searchConfig = vectorConfig.get('search');
    const loggingConfig = vectorConfig.get('logging');
    
    this.defaultLimit = options.defaultLimit || searchConfig.defaultLimit;
    this.defaultThreshold = options.defaultThreshold || searchConfig.defaultThreshold;
    this.maxLimit = searchConfig.maxLimit;
    this.chunkMultiplier = searchConfig.chunkMultiplier;
    
    // Initialize error handler
    this.errorHandler = createErrorHandler(this.serviceName, {
      enableTelemetry: options.enableTelemetry !== false && loggingConfig.enableTelemetry,
      logLevel: options.logLevel || loggingConfig.level
    });
    
    // Initialize cache for search results
    const cacheConfig = vectorConfig.getCacheConfig(options.cacheType || 'baseService');
    this.cache = createCache.general({
      name: `${this.serviceName}Cache`,
      maxSize: options.cacheSize || cacheConfig.maxSize,
      ttl: options.cacheTTL || cacheConfig.ttl
    });
  }

  /**
   * Perform vector similarity search with common logic
   * @param {Object} params - Search parameters
   * @returns {Promise<Object>} Search results
   */
  async performSimilaritySearch(params) {
    try {
      // Validate and sanitize parameters
      const validatedParams = this.validateSearchParams(params);
      const { query, userId, filters, options } = validatedParams;
      
      console.log(`[${this.serviceName}] Performing similarity search for: "${query}"`);
      
      // Check cache first
      if (options.useCache) {
        const cacheKey = this.generateCacheKey(validatedParams);
        const cached = this.cache.get(cacheKey);
        if (cached) {
          console.log(`[${this.serviceName}] Cache hit for query: "${query}"`);
          return cached;
        }
      }
      
      // Generate query embedding
      const queryEmbedding = await this.generateQueryEmbedding(query, options);
      
      // Calculate dynamic threshold
      const threshold = options.threshold ?? this.calculateDynamicThreshold(query);
      
      // Find similar chunks
      const chunks = await this.findSimilarChunks({
        embedding: queryEmbedding,
        userId,
        filters,
        limit: Math.round(options.limit * this.chunkMultiplier), // Get more for better ranking
        threshold
      });
      
      // Handle empty results
      if (chunks.length === 0) {
        return this.handleEmptyResults(query, options, userId);
      }
      
      // Group and rank results
      const results = await this.groupAndRankResults(chunks, options.limit);
      
      // Build response
      const response = {
        success: true,
        results,
        query: query.trim(),
        searchType: this.getSearchType(),
        message: `Found ${results.length} relevant document(s)`,
        metadata: {
          searchService: this.serviceName,
          totalChunks: chunks.length,
          threshold,
          cached: false
        }
      };
      
      // Cache the result
      if (options.useCache) {
        const cacheKey = this.generateCacheKey(validatedParams);
        this.cache.set(cacheKey, response);
      }
      
      console.log(`[${this.serviceName}] Found ${results.length} results for: "${query}"`);
      return response;
      
    } catch (error) {
      return this.errorHandler.handle(error, {
        operation: 'similarity_search',
        query: params.query,
        userId: params.userId,
        returnResponse: true
      });
    }
  }

  /**
   * Generate query embedding with smart expansion support
   * @param {string} query - Search query
   * @param {Object} options - Generation options
   * @returns {Promise<Array>} Query embedding
   * @protected
   */
  async generateQueryEmbedding(query, options = {}) {
    // Can be overridden by subclasses for smart expansion
    return await embeddingService.generateQueryEmbedding(query);
  }

  /**
   * Find similar chunks in the database
   * @param {Object} params - Search parameters
   * @returns {Promise<Array>} Array of similar chunks
   * @protected
   */
  async findSimilarChunks(params) {
    const { embedding, userId, filters, limit, threshold } = params;
    
    // Validate and secure the embedding
    const embeddingString = InputValidator.validateEmbedding(embedding);
    
    // Choose appropriate RPC function based on filters
    const rpcFunction = this.getRPCFunction(filters);
    const rpcParams = this.buildRPCParams({
      embeddingString,
      userId,
      filters,
      limit,
      threshold
    });
    
    console.log(`[${this.serviceName}] Calling ${rpcFunction} with threshold: ${threshold}`);
    
    const { data: chunks, error } = await supabaseService.rpc(rpcFunction, rpcParams);
    
    if (error) {
      throw new DatabaseError(`Search RPC failed: ${error.message}`, 'RPC_ERROR', { 
        rpcFunction, 
        operation: 'similarity_search',
        originalError: error 
      });
    }
    
    // Transform results to consistent format
    return this.transformChunks(chunks || []);
  }

  /**
   * Group chunks by document and calculate rankings
   * @param {Array} chunks - Array of document chunks
   * @param {number} limit - Maximum results to return
   * @returns {Promise<Array>} Ranked document results
   * @protected
   */
  async groupAndRankResults(chunks, limit) {
    const documentMap = new Map();
    
    // Group chunks by document
    for (const chunk of chunks) {
      const docId = this.extractDocumentId(chunk);
      
      if (!documentMap.has(docId)) {
        documentMap.set(docId, {
          document_id: docId,
          title: this.extractDocumentTitle(chunk),
          filename: this.extractDocumentFilename(chunk),
          created_at: this.extractDocumentCreatedAt(chunk),
          chunks: [],
          maxSimilarity: 0,
          avgSimilarity: 0
        });
      }
      
      const docData = documentMap.get(docId);
      const chunkData = this.extractChunkData(chunk);
      docData.chunks.push(chunkData);
      
      // Update max similarity
      if (chunkData.similarity > docData.maxSimilarity) {
        docData.maxSimilarity = chunkData.similarity;
      }
    }
    
    // Calculate enhanced scores and format results
    const results = Array.from(documentMap.values()).map(doc => {
      // Sort chunks by similarity
      doc.chunks.sort((a, b) => b.similarity - a.similarity);
      
      // Calculate enhanced document score
      const enhancedScore = this.calculateEnhancedDocumentScore(doc.chunks);
      
      // Take top chunks per document using configuration
      const contentConfig = vectorConfig.get('content');
      const topChunks = doc.chunks.slice(0, contentConfig.maxChunksPerDocument);
      
      // Create combined relevant text
      const relevantContent = topChunks
        .map(chunk => this.extractRelevantExcerpt(chunk.text))
        .join('\n\n---\n\n');
      
      return {
        document_id: doc.document_id,
        title: doc.title,
        filename: doc.filename,
        created_at: doc.created_at,
        relevant_content: relevantContent,
        similarity_score: enhancedScore.finalScore,
        max_similarity: enhancedScore.maxSimilarity,
        avg_similarity: enhancedScore.avgSimilarity,
        position_score: enhancedScore.positionScore,
        diversity_bonus: enhancedScore.diversityBonus,
        chunk_count: doc.chunks.length,
        relevance_info: this.buildRelevanceInfo(doc, enhancedScore)
      };
    });
    
    // Sort by enhanced final score and return top results
    results.sort((a, b) => b.similarity_score - a.similarity_score);
    return results.slice(0, limit);
  }

  /**
   * Calculate enhanced document score with position weighting and diversity bonus
   * @param {Array} chunks - Array of document chunks with similarity scores
   * @returns {Object} Enhanced scoring metrics
   * @protected
   */
  calculateEnhancedDocumentScore(chunks) {
    const scoringConfig = vectorConfig.get('scoring');
    
    if (!chunks || chunks.length === 0) {
      return {
        finalScore: 0,
        maxSimilarity: 0,
        avgSimilarity: 0,
        positionScore: 0,
        diversityBonus: 0
      };
    }
    
    const similarities = chunks.map(c => c.similarity);
    const maxSimilarity = Math.max(...similarities);
    const avgSimilarity = similarities.reduce((a, b) => a + b) / similarities.length;
    
    // Position-aware scoring using configuration
    let positionScore = 0;
    chunks.forEach((chunk) => {
      const positionWeight = Math.max(
        scoringConfig.minPositionWeight, 
        1 - (chunk.chunk_index * scoringConfig.positionDecayRate)
      );
      positionScore += chunk.similarity * positionWeight;
    });
    positionScore = positionScore / chunks.length;
    
    // Diversity bonus using configuration
    const diversityBonus = Math.min(
      scoringConfig.maxDiversityBonus, 
      chunks.length * scoringConfig.diversityBonusRate
    );
    
    // Weighted final score using configuration
    const finalScore = (maxSimilarity * scoringConfig.maxSimilarityWeight) + 
                      (avgSimilarity * scoringConfig.avgSimilarityWeight) + 
                      (positionScore * scoringConfig.positionWeight) + 
                      diversityBonus;
    
    return {
      finalScore: Math.min(scoringConfig.maxFinalScore, finalScore),
      maxSimilarity,
      avgSimilarity,
      positionScore,
      diversityBonus
    };
  }

  /**
   * Calculate dynamic similarity threshold based on query characteristics
   * @param {string} query - Search query
   * @returns {number} Calculated threshold between min and max
   * @protected
   */
  calculateDynamicThreshold(query) {
    const searchConfig = vectorConfig.get('search');
    const baseThreshold = this.defaultThreshold;
    const queryWords = query.trim().split(/\s+/);
    const queryLength = queryWords.length;
    
    // Query length adjustment using configuration
    const adjustments = searchConfig.lengthAdjustments;
    let lengthAdjustment = 0;
    
    if (queryLength === 1) {
      lengthAdjustment = adjustments.singleWord;
    } else if (queryLength === 2) {
      lengthAdjustment = adjustments.twoWords;
    } else if (queryLength >= adjustments.manyWordsThreshold) {
      lengthAdjustment = adjustments.manyWords;
    }
    
    const finalThreshold = baseThreshold + lengthAdjustment;
    const clampedThreshold = Math.max(
      searchConfig.minThreshold, 
      Math.min(searchConfig.maxThreshold, finalThreshold)
    );
    
    if (vectorConfig.isVerboseMode()) {
      console.log(`[${this.serviceName}] Dynamic threshold: base=${baseThreshold}, length_adj=${lengthAdjustment}, final=${clampedThreshold}`);
    }
    
    return clampedThreshold;
  }

  /**
   * Extract relevant excerpt from text
   * @param {string} text - Text to excerpt
   * @param {number} maxLength - Maximum length (defaults to config value)
   * @returns {string} Excerpted text
   * @protected
   */
  extractRelevantExcerpt(text, maxLength = null) {
    const contentConfig = vectorConfig.get('content');
    const actualMaxLength = maxLength || contentConfig.maxExcerptLength;
    
    if (!text || text.length <= actualMaxLength) {
      return text;
    }
    
    // Smart truncation at sentence boundary using config
    const truncated = text.substring(0, actualMaxLength);
    const lastPunctuation = Math.max(
      truncated.lastIndexOf('.'),
      truncated.lastIndexOf('?'),
      truncated.lastIndexOf('!')
    );
    
    if (lastPunctuation > actualMaxLength * contentConfig.excerptSentenceBoundary) {
      return truncated.substring(0, lastPunctuation + 1);
    }
    
    return truncated + '...';
  }

  // Abstract methods to be implemented by subclasses

  /**
   * Validate search parameters (should be overridden)
   * @param {Object} params - Parameters to validate
   * @returns {Object} Validated parameters
   * @protected
   */
  validateSearchParams(params) {
    // Basic validation - subclasses should override for specific validation
    return InputValidator.validateSearchParams(params);
  }

  /**
   * Get RPC function name based on filters
   * @param {Object} filters - Search filters
   * @returns {string} RPC function name
   * @protected
   */
  getRPCFunction(filters) {
    // Override in subclasses
    return 'similarity_search_optimized';
  }

  /**
   * Build RPC parameters
   * @param {Object} params - Parameter object
   * @returns {Object} RPC parameters
   * @protected
   */
  buildRPCParams(params) {
    const { embeddingString, userId, filters, limit, threshold } = params;
    
    return {
      query_embedding: embeddingString,
      user_id_filter: userId,
      similarity_threshold: threshold,
      match_count: limit
    };
  }

  /**
   * Transform database chunks to consistent format
   * @param {Array} chunks - Raw database chunks
   * @returns {Array} Transformed chunks
   * @protected
   */
  transformChunks(chunks) {
    return chunks.map(chunk => ({
      id: chunk.id,
      document_id: chunk.document_id,
      chunk_index: chunk.chunk_index,
      chunk_text: chunk.chunk_text,
      similarity: chunk.similarity,
      token_count: chunk.token_count,
      created_at: chunk.created_at,
      documents: {
        id: chunk.document_id,
        title: chunk.document_title,
        filename: chunk.document_filename,
        created_at: chunk.document_created_at
      }
    }));
  }

  /**
   * Extract document ID from chunk
   */
  extractDocumentId(chunk) {
    return chunk.documents?.id || chunk.document_id;
  }

  /**
   * Extract document title from chunk
   */
  extractDocumentTitle(chunk) {
    return chunk.documents?.title || chunk.document_title;
  }

  /**
   * Extract document filename from chunk
   */
  extractDocumentFilename(chunk) {
    return chunk.documents?.filename || chunk.document_filename;
  }

  /**
   * Extract document created_at from chunk
   */
  extractDocumentCreatedAt(chunk) {
    return chunk.documents?.created_at || chunk.document_created_at;
  }

  /**
   * Extract chunk data for processing
   */
  extractChunkData(chunk) {
    return {
      chunk_id: chunk.id,
      chunk_index: chunk.chunk_index,
      text: chunk.chunk_text,
      similarity: chunk.similarity || 0,
      token_count: chunk.token_count
    };
  }

  /**
   * Build relevance information string
   */
  buildRelevanceInfo(doc, enhancedScore) {
    return `Found ${doc.chunks.length} relevant sections in "${doc.title}" (diversity: +${(enhancedScore.diversityBonus * 100).toFixed(1)}%)`;
  }

  /**
   * Get search type identifier
   * @returns {string} Search type
   * @protected
   */
  getSearchType() {
    return 'vector';
  }

  /**
   * Handle empty search results
   * @param {string} query - Original query
   * @param {Object} options - Search options
   * @param {string} userId - User ID (for subclass fallback implementations)
   * @returns {Object} Empty results response
   * @protected
   */
  handleEmptyResults(query, options, userId = null) {
    return {
      success: true,
      results: [],
      query: query.trim(),
      searchType: this.getSearchType(),
      message: 'No relevant documents found'
    };
  }

  /**
   * Create error response
   * @param {Error} error - Error that occurred
   * @param {string} query - Original query
   * @returns {Object} Error response
   * @protected
   */
  createErrorResponse(error, query = '') {
    if (error instanceof ValidationError) {
      return InputValidator.createSafeErrorResponse(error);
    }
    
    if (error instanceof SearchError) {
      return {
        success: false,
        error: error.message,
        code: error.code,
        results: [],
        query: query.trim(),
        searchType: 'error'
      };
    }
    
    return {
      success: false,
      error: 'Search failed',
      message: 'An unexpected error occurred during search',
      results: [],
      query: query.trim(),
      searchType: 'error'
    };
  }

  /**
   * Generate cache key for search parameters
   * @param {Object} params - Search parameters
   * @returns {string} Cache key
   * @protected
   */
  generateCacheKey(params) {
    const keyData = {
      query: params.query,
      userId: params.userId,
      filters: params.filters,
      limit: params.options?.limit,
      threshold: params.options?.threshold
    };
    
    return `${this.serviceName}:${this.simpleHash(JSON.stringify(keyData))}`;
  }

  /**
   * Simple hash function for cache keys
   * @param {string} str - String to hash
   * @returns {string} Hash string
   * @protected
   */
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }
}

export { BaseSearchService, SearchError };
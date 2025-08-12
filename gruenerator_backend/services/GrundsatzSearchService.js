/**
 * Grundsatz Search Service - Specialized search for Grundsatzprogramme documents
 * Extends BaseSearchService to eliminate code duplication from VectorSearchService
 */

import { BaseSearchService } from './BaseSearchService.js';

/**
 * Specialized search service for Grundsatzprogramme documents
 */
class GrundsatzSearchService extends BaseSearchService {
  
  constructor() {
    super({
      serviceName: 'GrundsatzSearch',
      defaultLimit: 5,
      defaultThreshold: 0.3,
      cacheSize: 100,
      cacheTTL: 3600000 // 1 hour (Grundsatz documents change less frequently)
    });
  }

  /**
   * Get RPC function name for Grundsatz documents (overrides base class)
   * @param {Object} filters - Search filters (ignored for Grundsatz)
   * @returns {string} RPC function name
   * @protected
   */
  getRPCFunction(filters) {
    return 'similarity_search_grundsatz';
  }

  /**
   * Build RPC parameters for Grundsatz search (overrides base class)
   * @param {Object} params - Parameter object
   * @returns {Object} RPC parameters
   * @protected
   */
  buildRPCParams(params) {
    const { embeddingString, threshold, limit } = params;
    
    // Grundsatz search doesn't use user_id filtering
    return {
      query_embedding: embeddingString,
      similarity_threshold: threshold,
      match_count: limit
    };
  }

  /**
   * Get search type identifier (overrides base class)
   * @returns {string} Search type
   * @protected
   */
  getSearchType() {
    return 'grundsatz_vector';
  }

  /**
   * Handle empty search results (overrides base class)
   * @param {string} query - Original query
   * @param {Object} options - Search options
   * @param {string} userId - User ID (ignored for Grundsatz)
   * @returns {Object} Empty results response
   * @protected
   */
  handleEmptyResults(query, options, userId = null) {
    return {
      success: true,
      results: [],
      query: query.trim(),
      searchType: this.getSearchType(),
      message: 'No relevant documents found in Grundsatzprogramme'
    };
  }

  /**
   * Build relevance information string (overrides base class)
   * @param {Object} doc - Document object
   * @param {Object} enhancedScore - Enhanced scoring metrics
   * @returns {string} Relevance information
   * @protected
   */
  buildRelevanceInfo(doc, enhancedScore) {
    return `Found ${doc.chunks.length} relevant sections in "${doc.title}" (Grundsatzprogramm)`;
  }

  /**
   * Search Grundsatz documents
   * @param {Object} searchParams - Search parameters
   * @returns {Promise<Object>} Search results
   */
  async searchGrundsatz(searchParams) {
    const { query, user_id, limit = 5, mode = 'vector', threshold = null } = searchParams;
    
    console.log(`[GrundsatzSearchService] Search request: query="${query}", mode="${mode}", user_id="${user_id}"`);
    
    // Use base class performSimilaritySearch
    return await this.performSimilaritySearch({
      query,
      userId: user_id, // Passed but not used in Grundsatz search
      filters: {}, // No filters for Grundsatz
      options: {
        limit,
        threshold,
        useCache: true,
        useSmartExpansion: false // Grundsatz search uses simple embeddings
      }
    });
  }
}

// Export singleton instance
export const grundsatzSearchService = new GrundsatzSearchService();
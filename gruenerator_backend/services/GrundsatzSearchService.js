/**
 * Grundsatz Search Service - Specialized search for Grundsatzprogramme documents
 * Extends BaseSearchService for shared functionality
 */

import { BaseSearchService } from './BaseSearchService.js';
import { getQdrantInstance } from '../database/services/QdrantService.js';
import { QdrantOperations } from '../database/services/QdrantOperations.js';
import { fastEmbedService } from './FastEmbedService.js';

/**
 * Specialized search service for Grundsatzprogramme documents
 */
class GrundsatzSearchService extends BaseSearchService {
  
  constructor() {
    super({
      serviceName: 'GrundsatzSearch',
      defaultLimit: 5,
      defaultThreshold: 0.25 // Lower threshold for political content
    });
    
    this.qdrant = getQdrantInstance();
    this.qdrantOps = null; // Initialize after Qdrant is ready
    this.collectionName = 'grundsatz_documents';
    this.initialized = false;
  }

  /**
   * Initialize Qdrant operations
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.qdrant.init();
      this.qdrantOps = new QdrantOperations(this.qdrant.client);
      this.initialized = true;
    }
  }

  /**
   * Calculate Grundsatz-specific dynamic threshold
   * @param {string} query - Search query
   * @returns {number} Calculated threshold
   * @private
   */
  calculateGrundsatzThreshold(query) {
    // Use parent's base calculation
    const baseThreshold = BaseSearchService.calculateThreshold(query, this.defaultThreshold);
    
    // Additional adjustment for German political terms
    const politicalTerms = ['politik', 'partei', 'wahl', 'bundestag', 'regierung', 'minister', 'grün', 'grüne', 'umwelt', 'klima', 'energie', 'bildung', 'sozial', 'essen', 'ernährung', 'landwirtschaft', 'lebensmittel'];
    const queryLower = query.toLowerCase();
    const hasPoliticalTerms = politicalTerms.some(term => queryLower.includes(term));
    
    const politicalAdjustment = hasPoliticalTerms ? -0.05 : 0;
    const finalThreshold = Math.max(0.2, Math.min(0.8, baseThreshold + politicalAdjustment));
    
    console.log(`[GrundsatzSearchService] Grundsatz threshold: ${finalThreshold} (political: ${hasPoliticalTerms})`);
    return finalThreshold;
  }

  // ========== BaseSearchService Implementation ==========

  /**
   * Implement doSearch() template method
   * @param {Object} params - Validated search parameters
   * @returns {Promise<Array>} Raw search results
   */
  async doSearch(params) {
    await this.ensureInitialized();
    
    // Generate query embedding
    const queryEmbedding = await fastEmbedService.generateQueryEmbedding(params.query);
    
    // Calculate Grundsatz-specific threshold
    const threshold = params.threshold || this.calculateGrundsatzThreshold(params.query);
    
    console.log(`[GrundsatzSearchService] Searching with threshold: ${threshold}`);
    
    // Search using QdrantOperations
    const results = await this.qdrantOps.vectorSearch(
      this.collectionName,
      queryEmbedding,
      {}, // No user filtering for public Grundsatz documents
      {
        limit: params.limit * 3, // Get more chunks for better document grouping
        threshold,
        withPayload: true
      }
    );
    
    // Transform to expected format for BaseSearchService
    return results.map(result => ({
      id: result.id,
      document_id: result.payload.document_id,
      chunk_index: result.payload.chunk_index || 0,
      chunk_text: result.payload.chunk_text,
      similarity: result.score,
      token_count: result.payload.token_count || 0,
      created_at: result.payload.created_at,
      documents: {
        id: result.payload.document_id,
        title: result.payload.title || 'Grundsatzprogramm',
        filename: result.payload.filename || '',
        created_at: result.payload.created_at
      }
    }));
  }

  /**
   * Get search type identifier
   * @returns {string} Search type
   */
  getSearchType() {
    return 'grundsatz_vector';
  }

  /**
   * Legacy method for backward compatibility
   * @param {Object} searchParams - Search parameters
   * @returns {Promise<Object>} Search results
   */
  async searchGrundsatz(searchParams) {
    const { query, user_id, limit = 5, mode = 'vector', threshold = null } = searchParams;
    
    return await this.search({
      query,
      user_id, // Not used for Grundsatz but kept for compatibility
      limit,
      threshold
    });
  }

  /**
   * Check if service is ready
   * @returns {Promise<boolean>} Ready status
   */
  async isReady() {
    try {
      await this.ensureInitialized();
      return await this.qdrantOps.healthCheck();
    } catch (error) {
      console.error('[GrundsatzSearchService] Service not ready:', error);
      return false;
    }
  }
}

// Export singleton instance
export const grundsatzSearchService = new GrundsatzSearchService();
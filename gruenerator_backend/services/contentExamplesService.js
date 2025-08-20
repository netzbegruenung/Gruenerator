/**
 * Simplified Content Examples Service
 * 
 * Provides relevant examples for any content type using only Qdrant vector search.
 * No Supabase dependencies, no complex AI agents - just direct vector similarity.
 */

import { getQdrantInstance } from '../database/services/QdrantService.js';
import { fastEmbedService } from './FastEmbedService.js';

class ContentExamplesService {
  constructor() {
    this.defaultLimit = 3;
    this.qdrant = getQdrantInstance();
    
    // Default similarity thresholds for different content types
    // Increased thresholds for better result diversity following Qdrant best practices
    this.defaultThresholds = {
      'instagram': 0.25,        // Increased from 0.15 for more diverse results
      'facebook': 0.25,         // Increased from 0.15 for more diverse results
      'twitter': 0.20,          // Increased from 0.15
      'antrag': 0.20,           // Kept same - good for formal documents
      'rede': 0.20,             // Kept same - good for formal documents
      'pressemitteilung': 0.20, // Increased from 0.15
      'default': 0.25           // Kept same
    };
  }

  /**
   * Get relevant examples for a specific content type
   * @param {string} contentType - Type of content ('instagram', 'facebook', 'antrag', etc.)
   * @param {string} userQuery - User's input/topic for finding similar examples
   * @param {Object} options - Additional options
   * @returns {Promise<Array>} Array of relevant examples
   */
  async getExamples(contentType, userQuery = '', options = {}) {
    const {
      limit = this.defaultLimit,
      threshold = this.defaultThresholds[contentType] || this.defaultThresholds.default,
      fallbackToRandom = true,
      categories = null,
      tags = null
    } = options;

    try {
      console.log(`[ContentExamplesService] Fetching ${limit} ${contentType} examples`);

      let examples = [];

      // If we have a query, do semantic search
      if (userQuery && userQuery.trim().length > 0) {
        examples = await this.searchExamples(contentType, userQuery.trim(), {
          limit,
          threshold,
          categories,
          tags
        });
      }

      // Fallback to random examples if no results or no query
      if (examples.length === 0 && fallbackToRandom) {
        examples = await this.getRandomExamples(contentType, limit, { categories, tags });
      }

      console.log(`[ContentExamplesService] Returning ${examples.length} examples`);
      return examples;

    } catch (error) {
      console.error(`[ContentExamplesService] Error fetching examples for ${contentType}:`, error);
      return [];
    }
  }

  /**
   * Search examples using vector similarity
   * @param {string} contentType - Type of content to search
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Array of matching examples
   */
  async searchExamples(contentType, query, options = {}) {
    try {
      // Ensure services are ready
      await fastEmbedService.init();
      if (!fastEmbedService.isReady()) {
        console.warn('[ContentExamplesService] FastEmbed not ready');
        return [];
      }

      if (!this.qdrant.isAvailable()) {
        console.warn('[ContentExamplesService] Qdrant not available');
        return [];
      }

      const {
        limit = this.defaultLimit,
        threshold = 0.25,
        categories = null,
        tags = null
      } = options;

      console.log(`[ContentExamplesService] Searching for "${query}" in ${contentType}`);

      // Generate embedding for search query
      const queryEmbedding = await fastEmbedService.generateEmbedding(query);

      // Route to appropriate collection based on content type
      let searchResult;
      if (contentType === 'facebook' || contentType === 'instagram') {
        // Search social media collection with platform filtering
        searchResult = await this.qdrant.searchSocialMediaExamples(queryEmbedding, {
          platform: contentType,
          limit,
          threshold
        });
      } else {
        // Search regular content examples collection
        searchResult = await this.qdrant.searchContentExamples(queryEmbedding, {
          contentType,
          limit,
          threshold,
          categories,
          tags
        });
      }

      if (!searchResult.success || !searchResult.results) {
        console.log(`[ContentExamplesService] Search returned no results`);
        return [];
      }

      console.log(`[ContentExamplesService] Found ${searchResult.results.length} similar examples`);
      return searchResult.results;

    } catch (error) {
      console.error(`[ContentExamplesService] Search error:`, error);
      return [];
    }
  }

  /**
   * Get random examples from Qdrant
   * @param {string} contentType - Type of content
   * @param {number} limit - Number of examples to return
   * @param {Object} filters - Additional filters
   * @returns {Promise<Array>} Array of random examples
   */
  async getRandomExamples(contentType, limit = 3, filters = {}) {
    try {
      if (!this.qdrant.isAvailable()) {
        console.warn('[ContentExamplesService] Qdrant not available for random examples');
        return [];
      }

      console.log(`[ContentExamplesService] Getting ${limit} random ${contentType} examples`);

      const { categories = null, tags = null } = filters;

      // Route to appropriate collection based on content type
      let result;
      if (contentType === 'facebook' || contentType === 'instagram') {
        // Get random social media examples with platform filtering
        result = await this.qdrant.getRandomSocialMediaExamples({
          platform: contentType,
          limit
        });
      } else {
        // Get random from regular content examples collection
        result = await this.qdrant.getRandomContentExamples({
          contentType,
          limit,
          categories,
          tags
        });
      }

      if (result.success && result.results.length > 0) {
        console.log(`[ContentExamplesService] Found ${result.results.length} random examples`);
        return result.results;
      }

      console.log(`[ContentExamplesService] No random examples available`);
      return [];

    } catch (error) {
      console.error(`[ContentExamplesService] Random examples error:`, error);
      return [];
    }
  }

  /**
   * Store a new content example in Qdrant
   * @param {Object} exampleData - Example data to store
   * @returns {Promise<Object>} Result of storage operation
   */
  async storeExample(exampleData) {
    try {
      // Ensure services are ready
      await fastEmbedService.init();
      if (!fastEmbedService.isReady() || !this.qdrant.isAvailable()) {
        console.warn('[ContentExamplesService] Services not ready for storing');
        return { success: false, error: 'Vector services not available' };
      }

      // Extract content for embedding
      let contentText = '';
      if (exampleData.content_data?.content) {
        contentText = exampleData.content_data.content;
      } else if (exampleData.content_data?.caption) {
        contentText = exampleData.content_data.caption;
      } else if (exampleData.description) {
        contentText = exampleData.description;
      } else {
        contentText = exampleData.title;
      }

      // Generate embedding
      const embeddingText = `${exampleData.title}\n\n${contentText}`.trim();
      const embedding = await fastEmbedService.generateEmbedding(embeddingText);

      // Store in Qdrant
      const metadata = {
        type: exampleData.type,
        title: exampleData.title,
        content: contentText,
        description: exampleData.description,
        content_data: exampleData.content_data,
        categories: exampleData.categories || [],
        tags: exampleData.tags || [],
        metadata: exampleData.metadata || {},
        created_at: exampleData.created_at || new Date().toISOString()
      };

      await this.qdrant.indexContentExample(exampleData.id, embedding, metadata);

      console.log(`[ContentExamplesService] Stored example ${exampleData.id} in Qdrant`);
      return { success: true };

    } catch (error) {
      console.error('[ContentExamplesService] Error storing example:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get available content types from Qdrant
   * @returns {Promise<Array>} List of available content types
   */
  async getAvailableContentTypes() {
    try {
      if (!this.qdrant.isAvailable()) {
        console.warn('[ContentExamplesService] Qdrant not available for content types');
        return [];
      }

      // Get collection stats to see what content types exist
      const stats = await this.qdrant.getCollectionStats('content_examples');
      
      if (stats.error) {
        console.error('[ContentExamplesService] Error getting collection stats:', stats.error);
        return [];
      }

      // For now, return the common types we know about
      // In a real implementation, you'd query the collection for unique types
      return ['instagram', 'facebook', 'twitter', 'antrag', 'rede', 'pressemitteilung'];

    } catch (error) {
      console.error('[ContentExamplesService] Error getting content types:', error);
      return [];
    }
  }

  /**
   * Get statistics about examples in Qdrant
   * @returns {Promise<Object>} Statistics object
   */
  async getExamplesStats() {
    try {
      if (!this.qdrant.isAvailable()) {
        console.warn('[ContentExamplesService] Qdrant not available for stats');
        return {};
      }

      const contentStats = await this.qdrant.getCollectionStats('content_examples');
      const socialMediaStats = await this.qdrant.getCollectionStats('social_media_examples');
      
      return {
        content_examples: {
          total_examples: contentStats.points_count || 0,
          vectors_count: contentStats.vectors_count || 0,
          collection_status: contentStats.status || 'unknown'
        },
        social_media_examples: {
          total_examples: socialMediaStats.points_count || 0,
          vectors_count: socialMediaStats.vectors_count || 0,
          collection_status: socialMediaStats.status || 'unknown'
        },
        total_all_examples: (contentStats.points_count || 0) + (socialMediaStats.points_count || 0)
      };

    } catch (error) {
      console.error('[ContentExamplesService] Stats error:', error);
      return {};
    }
  }

  /**
   * Search social media examples directly (convenience method)
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Array of social media examples
   */
  async searchSocialMediaExamples(query, options = {}) {
    const {
      platform = null, // 'facebook', 'instagram', or null for all
      limit = this.defaultLimit,
      threshold = 0.15
    } = options;

    try {
      console.log(`[ContentExamplesService] Social media search: "${query}" (platform: ${platform || 'all'})`);

      // Ensure services are ready
      await fastEmbedService.init();
      if (!fastEmbedService.isReady() || !this.qdrant.isAvailable()) {
        console.warn('[ContentExamplesService] Services not ready for social media search');
        return [];
      }

      // Generate embedding for search query
      const queryEmbedding = await fastEmbedService.generateEmbedding(query);

      // Search social media collection
      const searchResult = await this.qdrant.searchSocialMediaExamples(queryEmbedding, {
        platform,
        limit,
        threshold
      });

      if (!searchResult.success || !searchResult.results) {
        console.log(`[ContentExamplesService] Social media search returned no results`);
        return [];
      }

      console.log(`[ContentExamplesService] Found ${searchResult.results.length} social media examples`);
      return searchResult.results;

    } catch (error) {
      console.error(`[ContentExamplesService] Social media search error:`, error);
      return [];
    }
  }

  /**
   * Get random social media examples (convenience method)
   * @param {Object} options - Options for random selection
   * @returns {Promise<Array>} Array of random social media examples
   */
  async getRandomSocialMediaExamples(options = {}) {
    const {
      platform = null,
      limit = this.defaultLimit
    } = options;

    try {
      if (!this.qdrant.isAvailable()) {
        console.warn('[ContentExamplesService] Qdrant not available for random social media examples');
        return [];
      }

      console.log(`[ContentExamplesService] Getting ${limit} random social media examples (platform: ${platform || 'all'})`);

      const result = await this.qdrant.getRandomSocialMediaExamples({
        platform,
        limit
      });

      if (result.success && result.results.length > 0) {
        console.log(`[ContentExamplesService] Found ${result.results.length} random social media examples`);
        return result.results;
      }

      console.log(`[ContentExamplesService] No random social media examples available`);
      return [];

    } catch (error) {
      console.error('[ContentExamplesService] Random social media examples error:', error);
      return [];
    }
  }

  /**
   * Delete an example from Qdrant
   * @param {string} exampleId - ID of example to delete
   * @returns {Promise<Object>} Result of deletion
   */
  async deleteExample(exampleId) {
    try {
      if (!this.qdrant.isAvailable()) {
        return { success: false, error: 'Qdrant not available' };
      }

      const result = await this.qdrant.deleteContentExample(exampleId);
      console.log(`[ContentExamplesService] Deleted example ${exampleId}`);
      return result;

    } catch (error) {
      console.error('[ContentExamplesService] Delete error:', error);
      return { success: false, error: error.message };
    }
  }
}

// Export singleton instance
export const contentExamplesService = new ContentExamplesService();
export default contentExamplesService;
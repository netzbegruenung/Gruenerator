/**
 * Simplified Content Examples Service
 *
 * Provides relevant examples for any content type using only Qdrant vector search.
 * Supports locale-aware retrieval (de-DE for German, de-AT for Austrian content).
 */

import { getQdrantInstance } from '../database/services/QdrantService.js';
import { fastEmbedService } from './FastEmbedService.js';

class ContentExamplesService {
  constructor() {
    this.defaultLimit = 3;
    this.qdrant = getQdrantInstance();

    // Default similarity thresholds for different content types
    this.defaultThresholds = {
      'instagram': 0.25,
      'facebook': 0.25,
      'twitter': 0.20,
      'antrag': 0.20,
      'rede': 0.20,
      'pressemitteilung': 0.20,
      'default': 0.25
    };

    // Locale to country code mapping
    this.localeToCountry = {
      'de-DE': 'DE',
      'de-AT': 'AT'
    };
  }

  /**
   * Convert locale string to country code
   * @param {string} locale - Locale string (e.g., 'de-DE', 'de-AT')
   * @returns {string|null} Country code ('DE', 'AT') or null
   */
  getCountryFromLocale(locale) {
    if (!locale) return null;
    return this.localeToCountry[locale] || null;
  }

  /**
   * Get relevant examples for a specific content type
   * @param {string} contentType - Type of content ('instagram', 'facebook', 'antrag', etc.)
   * @param {string} userQuery - User's input/topic for finding similar examples
   * @param {Object} options - Additional options
   * @param {string} options.locale - User locale for country-specific examples (e.g., 'de-AT')
   * @param {string} options.country - Direct country filter ('DE', 'AT')
   * @returns {Promise<Array>} Array of relevant examples
   */
  async getExamples(contentType, userQuery = '', options = {}) {
    const {
      limit = this.defaultLimit,
      threshold = this.defaultThresholds[contentType] || this.defaultThresholds.default,
      fallbackToRandom = true,
      categories = null,
      tags = null,
      locale = null,
      country = null
    } = options;

    // Resolve country from locale if not directly specified
    const resolvedCountry = country || this.getCountryFromLocale(locale);

    try {
      const countryInfo = resolvedCountry ? ` (country: ${resolvedCountry})` : '';
      console.log(`[ContentExamplesService] Fetching ${limit} ${contentType} examples${countryInfo}`);

      let examples = [];

      // If we have a query, do semantic search
      if (userQuery && userQuery.trim().length > 0) {
        examples = await this.searchExamples(contentType, userQuery.trim(), {
          limit,
          threshold,
          categories,
          tags,
          country: resolvedCountry
        });
      }

      // Fallback to random examples if no results or no query
      if (examples.length === 0 && fallbackToRandom) {
        examples = await this.getRandomExamples(contentType, limit, {
          categories,
          tags,
          country: resolvedCountry
        });
      }

      // If still no results with country filter, try without country filter
      if (examples.length === 0 && resolvedCountry && fallbackToRandom) {
        console.log(`[ContentExamplesService] No ${resolvedCountry} examples, falling back to all countries`);
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
   * @param {string} options.country - Country filter ('DE', 'AT')
   * @returns {Promise<Array>} Array of matching examples
   */
  async searchExamples(contentType, query, options = {}) {
    try {
      const countryInfo = options.country ? ` (country: ${options.country})` : '';
      console.log(`[ContentExamplesService] Searching for "${query}" in ${contentType}${countryInfo}`);

      await fastEmbedService.init();
      if (!fastEmbedService.isReady()) {
        console.warn('[ContentExamplesService] FastEmbed service not ready - vector search disabled');
        return [];
      }

      if (!(await this.qdrant.isAvailable())) {
        console.warn('[ContentExamplesService] Qdrant not available - vector search disabled');
        return [];
      }

      const {
        limit = this.defaultLimit,
        threshold = 0.25,
        categories = null,
        tags = null,
        country = null
      } = options;

      // Generate embedding for search query
      let queryEmbedding;
      try {
        queryEmbedding = await fastEmbedService.generateEmbedding(query);
      } catch (embeddingError) {
        console.error('[ContentExamplesService] Failed to generate embedding:', embeddingError.message);
        return [];
      }

      // Route to appropriate collection based on content type
      let searchResult;
      try {
        if (contentType === 'facebook' || contentType === 'instagram') {
          // Search social media collection with platform and country filtering
          searchResult = await this.qdrant.searchSocialMediaExamples(queryEmbedding, {
            platform: contentType,
            country,
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
      } catch (searchError) {
        console.error('[ContentExamplesService] Qdrant search failed:', searchError.message);
        return [];
      }

      if (!searchResult || !searchResult.success || !searchResult.results) {
        console.log(`[ContentExamplesService] Vector search returned no results for "${query}" in ${contentType}`);
        return [];
      }

      console.log(`[ContentExamplesService] Found ${searchResult.results.length} similar examples`);
      
      // Log example details for debugging
      if (searchResult.results.length > 0) {
        searchResult.results.forEach((result, index) => {
          console.log(`[ContentExamplesService] Result ${index + 1}: ID="${result.id}", Score=${result.score?.toFixed(3)}, Content="${(result.content || 'undefined').substring(0, 50)}..."`);
        });
      }
      
      return searchResult.results;

    } catch (error) {
      console.error(`[ContentExamplesService] Unexpected search error:`, error.message);
      console.error('[ContentExamplesService] Stack trace:', error.stack);
      return [];
    }
  }

  /**
   * Get random examples from Qdrant
   * @param {string} contentType - Type of content
   * @param {number} limit - Number of examples to return
   * @param {Object} filters - Additional filters including country
   * @returns {Promise<Array>} Array of random examples
   */
  async getRandomExamples(contentType, limit = 3, filters = {}) {
    try {
      if (!(await this.qdrant.isAvailable())) {
        console.warn('[ContentExamplesService] Qdrant not available for random examples');
        return this._getMockExamples(contentType, limit);
      }

      const { categories = null, tags = null, country = null } = filters;
      const countryInfo = country ? ` (country: ${country})` : '';
      console.log(`[ContentExamplesService] Getting ${limit} random ${contentType} examples${countryInfo}`);

      // Route to appropriate collection based on content type
      let result;
      try {
        if (contentType === 'facebook' || contentType === 'instagram') {
          // Get random social media examples with platform and country filtering
          result = await this.qdrant.getRandomSocialMediaExamples({
            platform: contentType,
            country,
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
      } catch (qdrantError) {
        console.error(`[ContentExamplesService] Qdrant random examples failed:`, qdrantError.message);
        return this._getMockExamples(contentType, limit);
      }

      if (result && result.success && result.results && result.results.length > 0) {
        console.log(`[ContentExamplesService] Found ${result.results.length} random examples from Qdrant`);
        
        // Log example details for debugging
        result.results.forEach((example, index) => {
          console.log(`[ContentExamplesService] Random Example ${index + 1}: ID="${example.id}", Content="${(example.content || 'undefined').substring(0, 50)}..."`);
        });
        
        return result.results;
      }

      console.log(`[ContentExamplesService] No random examples available from Qdrant, using mock examples`);
      return this._getMockExamples(contentType, limit);

    } catch (error) {
      console.error(`[ContentExamplesService] Unexpected random examples error:`, error.message);
      return this._getMockExamples(contentType, limit);
    }
  }

  /**
   * Generate mock examples when vector services are unavailable
   * @param {string} contentType - Type of content
   * @param {number} limit - Number of examples to generate
   * @returns {Array} Array of mock examples
   * @private
   */
  _getMockExamples(contentType, limit = 3) {
    console.log(`[ContentExamplesService] Generating ${limit} mock examples for ${contentType} (vector services unavailable)`);
    
    const mockExamples = [];
    const mockContent = {
      instagram: [
        "🌱 Für eine grünere Zukunft! Unsere Vision für nachhaltige Politik beginnt heute. #Nachhaltigkeit #Grüne #Zukunft",
        "💚 Klimaschutz ist Zukunftsschutz. Jede kleine Tat zählt für unseren Planeten. Gemeinsam schaffen wir den Wandel! #Klimaschutz",
        "🌍 Eine bessere Welt ist möglich - mit grüner Politik, die Menschen und Umwelt in den Mittelpunkt stellt. #GrünePolitik"
      ],
      facebook: [
        "Unsere Sozialpolitik setzt auf Gerechtigkeit und Solidarität. Wir kämpfen für ein Deutschland, in dem alle Menschen die gleichen Chancen haben - unabhängig von Herkunft oder sozialem Status.",
        "Bildung ist der Schlüssel für eine gerechte Gesellschaft. Deshalb investieren wir in Schulen, Universitäten und lebenslanges Lernen für alle.",
        "Gesundheit ist ein Menschenrecht. Unser Ziel ist ein Gesundheitssystem, das allen Menschen - nicht nur den wohlhabenden - beste Versorgung garantiert."
      ]
    };
    
    const contentArray = mockContent[contentType] || mockContent.instagram;
    
    for (let i = 0; i < Math.min(limit, contentArray.length); i++) {
      mockExamples.push({
        id: `mock_${contentType}_${i + 1}`,
        title: `Mock ${contentType} Beispiel ${i + 1}`,
        content: contentArray[i],
        type: contentType,
        platform: contentType,
        similarity_score: null,
        relevance: 'mock',
        metadata: {
          categories: [],
          tags: ['mock', 'example'],
          isMock: true
        },
        created_at: new Date().toISOString()
      });
    }
    
    console.log(`[ContentExamplesService] Generated ${mockExamples.length} mock examples`);
    return mockExamples;
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
      if (!fastEmbedService.isReady() || !(await this.qdrant.isAvailable())) {
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
      if (!(await this.qdrant.isAvailable())) {
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
      if (!(await this.qdrant.isAvailable())) {
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
   * @param {string} options.locale - User locale for country filtering (e.g., 'de-AT')
   * @param {string} options.country - Direct country filter ('DE', 'AT')
   * @returns {Promise<Array>} Array of social media examples
   */
  async searchSocialMediaExamples(query, options = {}) {
    const {
      platform = null,
      limit = this.defaultLimit,
      threshold = 0.15,
      locale = null,
      country = null
    } = options;

    const resolvedCountry = country || this.getCountryFromLocale(locale);

    try {
      const countryInfo = resolvedCountry ? `, country: ${resolvedCountry}` : '';
      console.log(`[ContentExamplesService] Social media search: "${query}" (platform: ${platform || 'all'}${countryInfo})`);

      await fastEmbedService.init();
      if (!fastEmbedService.isReady() || !(await this.qdrant.isAvailable())) {
        console.warn('[ContentExamplesService] Services not ready for social media search');
        return [];
      }

      const queryEmbedding = await fastEmbedService.generateEmbedding(query);

      const searchResult = await this.qdrant.searchSocialMediaExamples(queryEmbedding, {
        platform,
        country: resolvedCountry,
        limit,
        threshold
      });

      if (!searchResult.success || !searchResult.results) {
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
   * @param {string} options.locale - User locale for country filtering
   * @param {string} options.country - Direct country filter ('DE', 'AT')
   * @returns {Promise<Array>} Array of random social media examples
   */
  async getRandomSocialMediaExamples(options = {}) {
    const {
      platform = null,
      limit = this.defaultLimit,
      locale = null,
      country = null
    } = options;

    const resolvedCountry = country || this.getCountryFromLocale(locale);

    try {
      if (!(await this.qdrant.isAvailable())) {
        console.warn('[ContentExamplesService] Qdrant not available for random social media examples');
        return [];
      }

      const countryInfo = resolvedCountry ? `, country: ${resolvedCountry}` : '';
      console.log(`[ContentExamplesService] Getting ${limit} random social media examples (platform: ${platform || 'all'}${countryInfo})`);

      const result = await this.qdrant.getRandomSocialMediaExamples({
        platform,
        country: resolvedCountry,
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
      if (!(await this.qdrant.isAvailable())) {
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
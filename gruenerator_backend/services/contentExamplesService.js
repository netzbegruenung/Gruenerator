/**
 * Universal Content Examples Service
 * 
 * Provides relevant examples for any content type (Instagram, Facebook, Twitter, Anträge, etc.)
 * using vector similarity search and intelligent caching.
 */

import { supabaseService } from '../utils/supabaseClient.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const aiSearchAgent = require('./aiSearchAgent.js');

class ContentExamplesService {
  constructor() {
    this.defaultLimit = 3;

    
    // Content type mappings for better search
    this.contentTypeAliases = {
      'social_media': ['instagram', 'facebook', 'twitter', 'linkedin'],
      'political': ['antrag', 'rede', 'pressemitteilung'],
      'campaign': ['wahlkampf', 'flyer', 'plakat']
    };
    
    // Default filters for different content types (optimized for better recall)
    this.defaultFilters = {
      'instagram': { platform: 'instagram', min_similarity: 0.15 },
      'facebook': { platform: 'facebook', min_similarity: 0.15 },
      'twitter': { platform: 'twitter', min_similarity: 0.15 },
      'antrag': { type: 'antrag', min_similarity: 0.20 },
      'rede': { type: 'rede', min_similarity: 0.20 },
      'pressemitteilung': { type: 'pressemitteilung', min_similarity: 0.15 }
    };
  }

  /**
   * Get relevant examples for a specific content type based on user input
   * OPTIMIZED: Now uses autonomous AI search as primary method
   * @param {string} contentType - Type of content ('instagram', 'facebook', 'antrag', etc.)
   * @param {string} userQuery - User's input/topic for finding similar examples
   * @param {Object} options - Additional options
   * @param {Object} req - Express request object (for AI worker pool access)
   * @returns {Promise<Array>} Array of relevant examples
   */
  async getExamples(contentType, userQuery = '', options = {}, req = null) {
    const {
      limit = this.defaultLimit,
      filters = {},
      fallbackToRandom = true,
      includeMetadata = true
    } = options;

    try {
      console.log(`[ContentExamplesService] Fetching ${limit} ${contentType} examples`);



      let examples = [];

      // STEP 1: Try autonomous AI search (if we have a query)
      if (userQuery && userQuery.trim().length > 0) {
        
        try {
          // Use clean user query for better semantic matching
          const searchQuery = userQuery.trim();
          const autonomousResult = await aiSearchAgent.searchDatabase(searchQuery, {
            contentType, // Pass content type as separate parameter
            maxResults: limit,
            returnFormat: 'ids',
            useCache: true
          }, req);

          if (autonomousResult.success && autonomousResult.elementIds?.length > 0) {
            const fullContent = await this.fetchContentByIds(autonomousResult.elementIds);
            if (fullContent.length > 0) {
              examples = fullContent;
            }
          }
        } catch (aiError) {
          console.warn(`[ContentExamplesService] AI search failed:`, aiError.message);
          // Fallback to legacy method if autonomous search fails
          examples = await this.findSimilarExamplesLegacy(contentType, userQuery, filters, limit);
        }
      }

      // STEP 2: Fallback to random examples if no results or no query
      if (examples.length === 0 && fallbackToRandom) {
        examples = await this.getRandomExamples(contentType, limit, filters);
      }

      // Format examples for consumption
      const formattedExamples = this.formatExamples(examples, includeMetadata);
      
      return formattedExamples;

    } catch (error) {
      console.error(`[ContentExamplesService] Error fetching examples for ${contentType}:`, error);
      
      // Return empty array on error, don't break the main flow
      return [];
    }
  }

  /**
   * LEGACY: Find examples using AI-enhanced vector similarity search
   * @deprecated Use autonomous AI search instead. Kept as fallback.
   * @private
   */
  async findSimilarExamplesLegacy(contentType, userQuery, filters = {}, limit = 3) {
    try {
      const threshold = filters.min_similarity || this.defaultFilters[contentType]?.min_similarity || 0.3;
      
      // Stage 1: Try direct search first
      console.log(`[ContentExamplesService] Stage 1: Direct search for "${userQuery}"`);
      let searchResults = await vectorSearchService.searchDatabaseExamples(
        userQuery,
        contentType,
        limit,
        threshold
      );

      // Stage 2: If results are poor, use AI-powered query enhancement
      const needsExpansion = !searchResults.success || 
                           !searchResults.results || 
                           searchResults.results.length === 0 ||
                           (searchResults.results.length > 0 && searchResults.results[0].similarity_score < 0.4);

      if (needsExpansion) {
        console.log(`[ContentExamplesService] Stage 2: Using AI-powered query enhancement (direct search yielded ${searchResults.results?.length || 0} results)`);
        
        try {
          // Use AI search agent for intelligent query enhancement
          const enhancement = await aiSearchAgent.enhanceQuery(userQuery, {
            contentType,
            limit,
            includeContext: true
          });
          
          if (enhancement.success && enhancement.enhancedQueries && enhancement.enhancedQueries.length > 0) {
            // Try enhanced queries in order
            for (let i = 0; i < enhancement.enhancedQueries.length && searchResults.results?.length === 0; i++) {
              const enhancedQuery = enhancement.enhancedQueries[i];
              console.log(`[ContentExamplesService] Trying AI-enhanced query ${i + 1}: "${enhancedQuery}"`);
              
              const enhancedResults = await vectorSearchService.searchDatabaseExamples(
                enhancedQuery,
                contentType,
                limit,
                Math.max(0.25, threshold - 0.05) // Slightly lower threshold for enhanced queries
              );
              
              if (enhancedResults.success && enhancedResults.results && enhancedResults.results.length > 0) {
                console.log(`[ContentExamplesService] AI enhancement successful! Found ${enhancedResults.results.length} results with confidence: ${enhancement.confidence}`);
                searchResults = enhancedResults;
                break;
              }
            }
          }
        } catch (enhancementError) {
          console.warn(`[ContentExamplesService] AI enhancement failed:`, enhancementError.message);
          // No hardcoded fallback - rely entirely on AI agent or direct search
        }
      }

      if (!searchResults.success || !searchResults.results || searchResults.results.length === 0) {
        console.log(`[ContentExamplesService] No similar examples found after both direct and AI-enhanced search`);
        return [];
      }

      console.log(`[ContentExamplesService] Final results: ${searchResults.results.length} examples with scores:`, 
        searchResults.results.map(r => ({ title: r.title?.substring(0, 40) + '...', score: r.similarity_score?.toFixed(3) })));

      // Convert vector search results to full content before returning
      const vectorResultIds = searchResults.results.map(r => r.id);
      const fullContentResults = await this.fetchContentByIds(vectorResultIds);
      
      // Merge similarity scores back into full content results
      const mergedResults = fullContentResults.map(content => {
        const vectorResult = searchResults.results.find(v => v.id === content.id);
        return {
          ...content,
          similarity_score: vectorResult?.similarity_score || null,
          relevance_explanation: vectorResult?.relevance_explanation || null
        };
      });
      
      return mergedResults;

    } catch (error) {
      console.error(`[ContentExamplesService] AI-enhanced vector search error:`, error);
      return [];
    }
  }

  /**
   * Get random examples as fallback
   * @private  
   */
  async getRandomExamples(contentType, limit = 3, filters = {}) {
    try {
      let query = supabaseService
        .from('database')
        .select('id, title, description, content_data, metadata, categories, tags, thumbnail_url, external_url, type, created_at')
        .eq('is_example', true)
        .eq('status', 'published')
        .eq('type', contentType)
        .limit(limit * 3); // Get more to randomize

      // Add additional filters
      Object.entries(filters).forEach(([key, value]) => {
        if (key !== 'min_similarity') {
          query = query.eq(key, value);
        }
      });

      const { data: examples, error } = await query;

      if (error) {
        console.error(`[ContentExamplesService] Error fetching random examples:`, error);
        return [];
      }

      // Shuffle and return requested limit
      if (examples && examples.length > 0) {
        const shuffled = examples.sort(() => Math.random() - 0.5);
        return shuffled.slice(0, limit);
      }

      return [];

    } catch (error) {
      console.error(`[ContentExamplesService] Random examples error:`, error);
      return [];
    }
  }

  /**
   * Format examples for consumption by AI prompts
   * @private
   */
  formatExamples(examples, includeMetadata = true) {
    if (!examples || examples.length === 0) {
      return [];
    }

    return examples.map((example, index) => {
      // Enhanced content extraction with better logging
      let content = '';
      let contentSource = 'none';
      
      if (example.content_data?.content) {
        content = example.content_data.content;
        contentSource = 'content_data.content';
      } else if (example.content_data?.caption) {
        content = example.content_data.caption;
        contentSource = 'content_data.caption';
      } else if (example.description) {
        content = example.description;
        contentSource = 'description';
      } else if (example.content_data?.text) {
        content = example.content_data.text;
        contentSource = 'content_data.text';
      } else if (typeof example.content_data === 'string') {
        content = example.content_data;
        contentSource = 'content_data (string)';
      } else {
        // This should never happen if all data sources provide complete data
        console.warn(`[ContentExamplesService] No content found for example ${example.id}: ${example.title}`);
        content = `[Content not available - ${example.title}]`;
        contentSource = 'fallback';
      }
      
      const formatted = {
        id: example.id,
        title: example.title,
        content: content,
        type: example.type,
        similarity_score: example.similarity_score || null,
        relevance_explanation: example.relevance_explanation || null
      };

      // Add relevance label at root level if similarity score exists
      if (example.similarity_score) {
        formatted.relevance = this.getRelevanceLabel(example.similarity_score);
      }

      // Simplified metadata from dedicated fields only
      if (includeMetadata) {
        formatted.metadata = {
          categories: example.categories || [],
          tags: example.tags || []
        };
      }

      return formatted;
    });
  }

  /**
   * Get human-readable relevance label based on similarity score
   * @private
   */
  getRelevanceLabel(score) {
    if (score >= 0.8) return 'very_high';
    if (score >= 0.6) return 'high';
    if (score >= 0.4) return 'medium';
    if (score >= 0.3) return 'low';
    return 'very_low';
  }



  /**
   * DEPRECATED: Get examples using natural language requests
   * @deprecated Use getExamplesWithAutonomousSearch() instead - it handles natural language natively
   * @param {string} naturalLanguageQuery - Full natural language request
   * @param {Object} options - Additional options
   * @returns {Promise<Array>} Array of relevant examples
   */
  async getExamplesWithNaturalLanguage(naturalLanguageQuery, options = {}) {
    console.warn('[ContentExamplesService] getExamplesWithNaturalLanguage is deprecated. Use getExamplesWithAutonomousSearch instead.');
    
    // Redirect to autonomous search for better results
    const result = await this.getExamplesWithAutonomousSearch(naturalLanguageQuery, {
      ...options,
      fetchFullContent: true
    });
    
    return result.results || [];
  }

  /**
   * Get examples using autonomous AI search - returns specific element IDs with reasoning
   * @param {string} naturalLanguageQuery - Full natural language request
   * @param {Object} options - Additional options
   * @param {Object} req - Express request object (for AI worker pool access)
   * @returns {Promise<Object>} Search result with element IDs and reasoning
   */
  async getExamplesWithAutonomousSearch(naturalLanguageQuery, options = {}, req = null) {
    const {
      maxResults = this.defaultLimit,
      includeReasoning = true,
      fetchFullContent = true,
      useCache = true
    } = options;

    try {
      console.log(`[ContentExamplesService] Autonomous search request: "${naturalLanguageQuery}"`);

      // Use AI agent for autonomous database search
      const searchResult = await aiSearchAgent.searchDatabase(naturalLanguageQuery, {
        maxResults,
        includeReasoning,
        returnFormat: 'ids',
        useCache
      }, req);

      if (!searchResult.success || !searchResult.elementIds || searchResult.elementIds.length === 0) {
        console.log(`[ContentExamplesService] Autonomous search failed or returned no results, using fallback`);
        
        // Fallback to existing enhanced search
        const fallbackResult = await this.getExamplesWithNaturalLanguage(naturalLanguageQuery, {
          ...options,
          limit: maxResults
        });
        
        return {
          success: true,
          results: fallbackResult,
          searchType: 'fallback_enhanced',
          reasoning: 'Autonomous search failed, used enhanced search fallback',
          confidence: 0.6
        };
      }

      // If we only need IDs, return them
      if (!fetchFullContent) {
        return {
          success: true,
          elementIds: searchResult.elementIds,
          reasoning: searchResult.reasoning,
          confidence: searchResult.confidence,
          searchType: searchResult.searchStrategy,
          metadata: searchResult.metadata
        };
      }

      // Fetch full content for the selected IDs
      const fullContent = await this.fetchContentByIds(searchResult.elementIds);
      
      console.log(`[ContentExamplesService] Autonomous search completed: ${fullContent.length} examples retrieved`);
      
      return {
        success: true,
        results: fullContent,
        elementIds: searchResult.elementIds,
        reasoning: searchResult.reasoning,
        confidence: searchResult.confidence,
        searchType: searchResult.searchStrategy,
        metadata: {
          ...searchResult.metadata,
          contentFetched: fullContent.length,
          idsRequested: searchResult.elementIds.length
        }
      };

    } catch (error) {
      console.error('[ContentExamplesService] Autonomous search error:', error);
      
      // Ultimate fallback to traditional search
      const fallbackResults = await this.getExamplesWithNaturalLanguage(naturalLanguageQuery, options);
      
      return {
        success: false,
        error: error.message,
        results: fallbackResults,
        searchType: 'error_fallback',
        reasoning: `Autonomous search failed: ${error.message}. Used traditional search as fallback.`,
        confidence: 0.4
      };
    }
  }

  /**
   * Fetch full content for specific database element IDs
   * @private
   */
  async fetchContentByIds(elementIds) {
    if (!elementIds || !Array.isArray(elementIds) || elementIds.length === 0) {
      return [];
    }

    try {
      console.log(`[ContentExamplesService] Fetching full content for ${elementIds.length} elements`);

      // Query database table for these specific IDs
      const { data: elements, error } = await supabaseService
        .from('database')
        .select('id, title, description, content_data, metadata, categories, tags, thumbnail_url, external_url, type, created_at')
        .in('id', elementIds)
        .eq('is_example', true)
        .eq('status', 'published');

      if (error) {
        console.error('[ContentExamplesService] Error fetching content by IDs:', error);
        return [];
      }

      // Sort results according to original order (return RAW objects, not formatted)
      const orderedResults = [];
      for (const elementId of elementIds) {
        const element = elements.find(el => el.id === elementId);
        if (element) {
          orderedResults.push(element); // Return raw database object
        }
      }

      console.log(`[ContentExamplesService] Successfully fetched ${orderedResults.length}/${elementIds.length} elements`);
      return orderedResults;

    } catch (error) {
      console.error('[ContentExamplesService] fetchContentByIds error:', error);
      return [];
    }
  }

  /**
   * Get available content types
   */
  async getAvailableContentTypes() {
    try {
      const { data: types, error } = await supabaseService
        .from('database')
        .select('type')
        .eq('is_example', true)
        .eq('status', 'published');

      if (error) {
        console.error('[ContentExamplesService] Error fetching content types:', error);
        return [];
      }

      // Get unique types
      const uniqueTypes = [...new Set(types.map(t => t.type))];
      return uniqueTypes.sort();

    } catch (error) {
      console.error('[ContentExamplesService] Error:', error);
      return [];
    }
  }


  /**
   * Get statistics about examples
   */
  async getExamplesStats() {
    try {
      const { data: stats, error } = await supabaseService
        .rpc('get_examples_stats');

      if (error) {
        console.warn('[ContentExamplesService] Stats query failed, using fallback');
        
        // Fallback query
        const { data: fallbackStats, error: fallbackError } = await supabaseService
          .from('database')
          .select('type, content_data')
          .eq('is_example', true)
          .eq('status', 'published');

        if (fallbackError) return {};

        // Aggregate stats manually
        const typeStats = {};
        fallbackStats.forEach(example => {
          if (!typeStats[example.type]) {
            typeStats[example.type] = { count: 0, topics: new Set() };
          }
          typeStats[example.type].count++;
          if (example.content_data?.topic) {
            typeStats[example.type].topics.add(example.content_data.topic);
          }
        });

        return typeStats;
      }

      return stats;

    } catch (error) {
      console.error('[ContentExamplesService] Stats error:', error);
      return {};
    }
  }
}

// Export singleton instance
export const contentExamplesService = new ContentExamplesService();
export default contentExamplesService;
import MistralWebSearchService from '../services/mistralWebSearchService.js';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

// Konfiguration
const searchConfig = {
  defaultSearchOptions: {
    searchDepth: 'advanced',
    maxResults: 10,
    includeDomains: [],
    excludeDomains: []
  },
  cache: {
    enabled: true,
    ttl: 3600
  },
  rateLimit: {
    windowMs: 15 * 60 * 1000,
    max: 100
  }
};

class WebSearchService {
  constructor() {
    this.mistralService = new MistralWebSearchService();
  }

  async search(query, options = {}) {
    try {
      console.log('Sending request to MistralWebSearchService:', {
        query,
        options
      });

      // Use Mistral's content agent type for comprehensive search
      const agentType = 'content';
      const mistralResults = await this.mistralService.performWebSearch(query, agentType);

      if (!mistralResults) {
        throw new Error('Keine Daten von Mistral Web Search erhalten');
      }

      // Convert Mistral response to Tavily-compatible format
      const tavilyCompatibleResponse = {
        results: mistralResults.sources.map(source => ({
          url: source.url,
          title: source.title,
          content: source.snippet,
          raw_content: mistralResults.textContent,
          score: source.relevance
        })),
        answer: mistralResults.textContent,
        query: query,
        response_time: 0 // Not available from Mistral
      };

      return tavilyCompatibleResponse;
    } catch (error) {
      console.error('MistralWebSearchService API Error:', {
        message: error.message,
        details: error.details || error
      });
      throw new Error(error.message || 'Failed to fetch search results');
    }
  }

  async deepSearch(queries, options = {}) {
    try {
      console.log(`[WebSearchService] Starting deep search with ${queries.length} queries`);
      
      // Execute all searches in parallel
      const searchPromises = queries.map(async (query, index) => {
        try {
          console.log(`[WebSearchService] Executing search ${index + 1}/${queries.length}: ${query}`);
          const result = await this.search(query, options);
          
          return {
            query,
            success: true,
            result
          };
        } catch (error) {
          console.error(`[WebSearchService] Error in search ${index + 1}:`, error);
          return {
            query,
            success: false,
            error: error.message,
            result: { results: [], answer: null }
          };
        }
      });

      const searchResults = await Promise.all(searchPromises);
      console.log(`[WebSearchService] Deep search completed. ${searchResults.filter(r => r.success).length}/${queries.length} searches successful`);

      return searchResults;
    } catch (error) {
      console.error('[WebSearchService] Deep search error:', error);
      throw new Error(`Deep search failed: ${error.message}`);
    }
  }

  /**
   * Deduplicate sources across multiple search results
   * @param {Array} searchResults - Array of search result objects
   * @returns {Array} Deduplicated sources with category information
   */
  deduplicateSources(searchResults) {
    const sourceMap = new Map();
    const deduplicatedSources = [];

    searchResults.forEach((searchResult, searchIndex) => {
      const category = searchResult.category || `Search ${searchIndex + 1}`;
      const results = searchResult.result?.results || searchResult.results || [];

      results.forEach(source => {
        if (!sourceMap.has(source.url)) {
          // New source
          const enhancedSource = {
            ...source,
            categories: [category],
            searchQueries: [searchResult.query || `Query ${searchIndex + 1}`],
            firstFoundIn: searchIndex
          };
          sourceMap.set(source.url, enhancedSource);
          deduplicatedSources.push(enhancedSource);
        } else {
          // Existing source - add category and query
          const existingSource = sourceMap.get(source.url);
          if (!existingSource.categories.includes(category)) {
            existingSource.categories.push(category);
          }
          if (!existingSource.searchQueries.includes(searchResult.query)) {
            existingSource.searchQueries.push(searchResult.query || `Query ${searchIndex + 1}`);
          }
        }
      });
    });

    console.log(`[WebSearchService] Deduplicated ${deduplicatedSources.length} unique sources from ${searchResults.length} searches`);
    return deduplicatedSources;
  }

  /**
   * Categorize sources by themes
   * @param {Array} sources - Array of source objects with categories
   * @returns {Object} Sources grouped by categories
   */
  categorizeSources(sources) {
    const categorized = {};
    
    sources.forEach(source => {
      source.categories.forEach(category => {
        if (!categorized[category]) {
          categorized[category] = [];
        }
        categorized[category].push(source);
      });
    });

    console.log(`[WebSearchService] Categorized sources into ${Object.keys(categorized).length} categories`);
    return categorized;
  }
}

const webSearchService = new WebSearchService();
const tavilyService = new WebSearchService();

export { searchConfig, webSearchService, tavilyService };
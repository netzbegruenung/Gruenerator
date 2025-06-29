const { tavily } = require('@tavily/core');
const dotenv = require('dotenv');

dotenv.config();

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

class TavilyService {
  constructor() {
    this.client = tavily({ apiKey: process.env.TAVILY_API_KEY });
  }

  async search(query, options = {}) {
    try {
      const searchParams = {
        search_depth: options.searchDepth || searchConfig.defaultSearchOptions.searchDepth,
        max_results: options.maxResults || searchConfig.defaultSearchOptions.maxResults,
        include_domains: options.includeDomains || searchConfig.defaultSearchOptions.includeDomains,
        exclude_domains: options.excludeDomains || searchConfig.defaultSearchOptions.excludeDomains,
        include_answer: options.includeAnswer,
        auto_parameters: options.autoParameters !== false // Default to true unless explicitly disabled
      };

      // Add enhanced content options when using advanced search
      if (searchParams.search_depth === 'advanced') {
        searchParams.chunks_per_source = options.chunksPerSource || 3;
        searchParams.include_raw_content = options.includeRawContent || 'markdown';
      }

      // Add topic and time filtering options
      if (options.topic) {
        searchParams.topic = options.topic;
      }
      if (options.timeRange) {
        searchParams.time_range = options.timeRange;
      }

      console.log('Sending request to Tavily:', {
        query,
        options: searchParams
      });

      const response = await this.client.search(query, searchParams);

      if (!response) {
        throw new Error('Keine Daten von Tavily API erhalten');
      }

      return response;
    } catch (error) {
      console.error('Tavily API Error:', {
        message: error.message,
        details: error.details || error
      });
      throw new Error(error.message || 'Failed to fetch search results');
    }
  }

  async deepSearch(queries, options = {}) {
    try {
      console.log(`[TavilyService] Starting deep search with ${queries.length} queries`);
      
      // Execute all searches in parallel
      const searchPromises = queries.map(async (query, index) => {
        try {
          console.log(`[TavilyService] Executing search ${index + 1}/${queries.length}: ${query}`);
          const result = await this.search(query, {
            searchDepth: options.searchDepth || 'advanced',
            maxResults: options.maxResults || 8,
            includeAnswer: options.includeAnswer || true,
            includeDomains: options.includeDomains,
            excludeDomains: options.excludeDomains,
            chunksPerSource: options.chunksPerSource || 3,
            includeRawContent: options.includeRawContent || 'markdown',
            autoParameters: options.autoParameters !== false,
            topic: options.topic,
            timeRange: options.timeRange
          });
          
          return {
            query,
            success: true,
            result
          };
        } catch (error) {
          console.error(`[TavilyService] Error in search ${index + 1}:`, error);
          return {
            query,
            success: false,
            error: error.message,
            result: { results: [], answer: null }
          };
        }
      });

      const searchResults = await Promise.all(searchPromises);
      console.log(`[TavilyService] Deep search completed. ${searchResults.filter(r => r.success).length}/${queries.length} searches successful`);

      return searchResults;
    } catch (error) {
      console.error('[TavilyService] Deep search error:', error);
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

    console.log(`[TavilyService] Deduplicated ${deduplicatedSources.length} unique sources from ${searchResults.length} searches`);
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

    console.log(`[TavilyService] Categorized sources into ${Object.keys(categorized).length} categories`);
    return categorized;
  }
}

module.exports = {
  searchConfig,
  tavilyService: new TavilyService()
}; 
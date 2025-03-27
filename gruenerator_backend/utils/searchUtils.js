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
      console.log('Sending request to Tavily:', {
        query,
        options: {
          search_depth: options.searchDepth || searchConfig.defaultSearchOptions.searchDepth,
          max_results: options.maxResults || searchConfig.defaultSearchOptions.maxResults,
          include_domains: options.includeDomains || searchConfig.defaultSearchOptions.includeDomains,
          exclude_domains: options.excludeDomains || searchConfig.defaultSearchOptions.excludeDomains
        }
      });

      const response = await this.client.search(query, {
        search_depth: options.searchDepth || searchConfig.defaultSearchOptions.searchDepth,
        max_results: options.maxResults || searchConfig.defaultSearchOptions.maxResults,
        include_domains: options.includeDomains || searchConfig.defaultSearchOptions.includeDomains,
        exclude_domains: options.excludeDomains || searchConfig.defaultSearchOptions.excludeDomains,
        include_answer: options.includeAnswer
      });

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
}

module.exports = {
  searchConfig,
  tavilyService: new TavilyService()
}; 
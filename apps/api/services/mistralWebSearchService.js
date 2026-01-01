/**
 * Mistral Web Search Service
 * Provides real web search capabilities using Mistral's web search agent
 */

import mistralClient from '../workers/mistralClient.js';

class MistralWebSearchService {
  constructor() {
    this.client = mistralClient;
    this.agent = null;
    this.agentId = null;
  }

  /**
   * Initialize Mistral client and create web search agent
   * @private
   */
  async initializeClient() {
    if (!this.client) {
      throw new Error('Mistral client not available. Check MISTRAL_API_KEY environment variable.');
    }
    
    console.log('[MistralWebSearchService] Using centralized Mistral client');
  }

  /**
   * Create or get web search agent
   * @param {Object} config - Agent configuration
   * @private
   */
  async getOrCreateAgent(config) {
    await this.initializeClient();
    
    // Use agent type as cache key to support multiple agent types
    const cacheKey = config.name;
    
    if (!this.agents) {
      this.agents = new Map();
    }
    
    if (!this.agents.has(cacheKey)) {
      console.log(`[MistralWebSearchService] Creating ${config.name}`);
      
      const agent = await this.client.beta.agents.create({
        model: "mistral-medium-latest",
        name: config.name,
        instructions: config.instructions,
        description: config.description,
        tools: config.tools,
      });
      
      this.agents.set(cacheKey, agent.id);
      console.log(`[MistralWebSearchService] Agent created with ID: ${agent.id}`);
    }
    
    return this.agents.get(cacheKey);
  }

  /**
   * Get agent configuration for different search types
   * @param {string} agentType - Type of agent ('withSources', 'withoutSources', 'news')
   * @returns {Object} Agent configuration
   * @private
   */
  getAgentConfig(agentType) {
    const configs = {
      content: {
        name: "Grünerator Content Search Agent",
        instructions: "You are a web search assistant for the Grünerator application. When asked to search, find current, relevant information and provide a comprehensive, detailed summary of all findings. Focus on German sources when appropriate, especially for political topics related to Bündnis 90/Die Grünen. Extract maximum content and details from your search results. Prioritize facts, policies, statements, and current developments. Do not focus on citing sources - focus on providing rich, detailed information content.",
        description: "Agent optimized for extracting maximum content from web searches.",
        tools: [{ type: "web_search" }],
        includeSources: false
      }
    };
    
    return configs[agentType] || configs.content;
  }

  /**
   * Perform web search using Mistral agent
   * @param {string} query - Search query
   * @param {string} agentType - Type of search agent ('withSources', 'withoutSources', 'news')
   * @returns {Promise<Object>} Search results
   * @throws {Error} If search fails
   */
  async performWebSearch(query, agentType = 'withSources') {
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new Error('Valid search query is required');
    }

    console.log(`[MistralWebSearchService] Searching with ${agentType} agent for: "${query}"`);
    
    try {
      const agentConfig = this.getAgentConfig(agentType);
      const agentId = await this.getOrCreateAgent(agentConfig);
      
      // Start conversation with search query
      const conversation = await this.client.beta.conversations.start({
        agentId: agentId,
        inputs: `Search for current information about: ${query}`,
        store: false // Don't store conversation for privacy
      });
      
      // Extract search results from conversation outputs
      const searchResults = this.extractSearchResults(conversation.outputs, query, agentType);
      
      // Clean, content-focused logging with source information
      if (searchResults.textContent && searchResults.textContent.trim()) {
        const contentLength = searchResults.textContent.length;
        const sourcesCount = searchResults.sourcesCount || 0;
        const preview = searchResults.textContent.substring(0, 300);
        console.log(`[MistralWebSearchService] Search complete: ${contentLength} chars of content extracted, ${sourcesCount} sources found`);
        console.log(`[MistralWebSearchService] Content preview: ${preview}${contentLength > 300 ? '...' : ''}`);
        
        if (sourcesCount > 0) {
          const domains = searchResults.sources.map(s => s.domain).join(', ');
          console.log(`[MistralWebSearchService] Sources from: ${domains}`);
        }
      } else {
        console.log(`[MistralWebSearchService] No content found for query: "${query}"`);
      }
      
      return searchResults;
      
    } catch (error) {
      console.error(`[MistralWebSearchService] Search failed for query "${query}":`, error.message);
      throw new Error(`Web search failed: ${error.message}`);
    }
  }

  /**
   * Extract and format search results from Mistral conversation outputs
   * @param {Array} outputs - Conversation outputs from Mistral
   * @param {string} originalQuery - Original search query
   * @param {string} agentType - Type of agent used for search
   * @returns {Object} Formatted search results
   * @private
   */
  extractSearchResults(outputs, originalQuery, agentType = 'withSources') {
    const results = [];
    const sources = [];
    let textContent = '';
    
    // Process conversation outputs - extract both content and sources
    for (const output of outputs) {
      if (output.type === 'message.output' && output.content) {
        for (const contentItem of output.content) {
          if (contentItem && contentItem.type === 'text' && contentItem.text) {
            textContent += contentItem.text + ' ';
          }
        }
      }
      
      // Extract sources from tool calls if available
      if (output.type === 'tool.output' && output.content) {
        for (const contentItem of output.content) {
          if (contentItem && contentItem.type === 'web_search') {
            // Extract source information from web search results
            if (contentItem.results && Array.isArray(contentItem.results)) {
              contentItem.results.forEach(result => {
                if (result.url && result.title) {
                  sources.push({
                    url: result.url,
                    title: result.title,
                    snippet: result.snippet || result.content || '',
                    relevance: result.score || 1.0,
                    domain: this.extractDomainFromUrl(result.url)
                  });
                }
              });
            }
          }
        }
      }
      
      // Also check for web search results in different output structures
      if (output.web_search_results && Array.isArray(output.web_search_results)) {
        output.web_search_results.forEach(result => {
          if (result.url && result.title) {
            sources.push({
              url: result.url,
              title: result.title,
              snippet: result.snippet || result.content || '',
              relevance: result.score || 1.0,
              domain: this.extractDomainFromUrl(result.url)
            });
          }
        });
      }
    }

    // Remove duplicate sources based on URL
    const uniqueSources = sources.filter((source, index, self) => 
      index === self.findIndex(s => s.url === source.url)
    );

    const result = {
      success: true,
      query: originalQuery,
      results: results,
      resultCount: results.length,
      searchEngine: 'mistral-websearch',
      agentType: agentType,
      textContent: textContent.trim(),
      sources: uniqueSources,
      sourcesCount: uniqueSources.length,
      timestamp: new Date().toISOString()
    };
    
    return result;
  }

  /**
   * Extract domain from URL for display purposes
   * @param {string} url - Full URL
   * @returns {string} Domain name
   * @private
   */
  extractDomainFromUrl(url) {
    try {
      const urlObject = new URL(url);
      return urlObject.hostname.replace('www.', '');
    } catch (error) {
      return url;
    }
  }

  /**
   * Extract relevant snippet from text content
   * @param {string} fullText - Full text content
   * @param {string} title - Reference title for context
   * @returns {string} Relevant snippet
   * @private
   */
  extractSnippetFromContent(fullText, title) {
    if (!fullText || fullText.length < 50) {
      return fullText || 'No content available';
    }
    
    // Try to find content around the title or just return first 200 chars
    const maxLength = 200;
    if (fullText.length <= maxLength) {
      return fullText.trim();
    }
    
    // Return first 200 characters with proper word boundary
    const snippet = fullText.substring(0, maxLength);
    const lastSpace = snippet.lastIndexOf(' ');
    
    if (lastSpace > maxLength * 0.8) {
      return snippet.substring(0, lastSpace).trim() + '...';
    }
    
    return snippet.trim() + '...';
  }

  /**
   * Cleanup method to clear agents if needed
   */
  async cleanup() {
    this.client = null;
    if (this.agents) {
      this.agents.clear();
    }
    this.agents = null;
    console.log('[MistralWebSearchService] Service cleaned up');
  }
}

export default MistralWebSearchService;
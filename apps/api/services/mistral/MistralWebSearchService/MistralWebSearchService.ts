/**
 * Mistral Web Search Service
 * Provides real web search capabilities using Mistral's web search agent
 */

import mistralClient from '../../../workers/mistralClient.js';
import { getAgentConfig } from './agentConfig.js';
import { extractSearchResults } from './resultExtraction.js';
import type { SearchResults, AgentType } from './types.js';

export class MistralWebSearchService {
  private client: any;
  private agents: Map<string, string> | null;

  constructor() {
    this.client = mistralClient;
    this.agents = null;
  }

  /**
   * Initialize Mistral client and create web search agent
   * @private
   */
  private async initializeClient(): Promise<void> {
    if (!this.client) {
      throw new Error('Mistral client not available. Check MISTRAL_API_KEY environment variable.');
    }

    console.log('[MistralWebSearchService] Using centralized Mistral client');
  }

  /**
   * Create or get web search agent
   * @param config - Agent configuration
   * @private
   */
  private async getOrCreateAgent(config: ReturnType<typeof getAgentConfig>): Promise<string> {
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

    return this.agents.get(cacheKey)!;
  }

  /**
   * Perform web search using Mistral agent
   * @param query - Search query
   * @param agentType - Type of search agent ('withSources', 'withoutSources', 'news')
   * @returns Search results
   * @throws Error if search fails
   */
  async performWebSearch(query: string, agentType: AgentType = 'withSources'): Promise<SearchResults> {
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new Error('Valid search query is required');
    }

    console.log(`[MistralWebSearchService] Searching with ${agentType} agent for: "${query}"`);

    try {
      const agentConfig = getAgentConfig(agentType);
      const agentId = await this.getOrCreateAgent(agentConfig);

      // Start conversation with search query
      const conversation = await this.client.beta.conversations.start({
        agentId: agentId,
        inputs: `Search for current information about: ${query}`,
        store: false // Don't store conversation for privacy
      });

      // Extract search results from conversation outputs
      const searchResults = extractSearchResults(conversation.outputs, query, agentType);

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
      const err = error as Error;
      console.error(`[MistralWebSearchService] Search failed for query "${query}":`, err.message);
      throw new Error(`Web search failed: ${err.message}`);
    }
  }

  /**
   * Cleanup method to clear agents if needed
   */
  async cleanup(): Promise<void> {
    this.client = null;
    if (this.agents) {
      this.agents.clear();
    }
    this.agents = null;
    console.log('[MistralWebSearchService] Service cleaned up');
  }
}

export default MistralWebSearchService;

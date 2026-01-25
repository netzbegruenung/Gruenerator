/**
 * MistralWebSearchService Agent Configuration
 * Provides agent configuration for different search types
 */

import type { AgentConfig, AgentType } from './types.js';

/**
 * Get agent configuration for different search types
 * @param agentType - Type of agent ('withSources', 'withoutSources', 'news')
 * @returns Agent configuration
 */
export function getAgentConfig(agentType: AgentType): AgentConfig {
  const configs: Record<AgentType, AgentConfig> = {
    content: {
      name: 'Grünerator Content Search Agent',
      instructions:
        'You are a web search assistant for the Grünerator application. When asked to search, find current, relevant information and provide a comprehensive, detailed summary of all findings. Focus on German sources when appropriate, especially for political topics related to Bündnis 90/Die Grünen. Extract maximum content and details from your search results. Prioritize facts, policies, statements, and current developments. Do not focus on citing sources - focus on providing rich, detailed information content.',
      description: 'Agent optimized for extracting maximum content from web searches.',
      tools: [{ type: 'web_search' }],
      includeSources: false,
    },
    withSources: {
      name: 'Grünerator Source Search Agent',
      instructions:
        'You are a web search assistant for the Grünerator application. When asked to search, find current, relevant information and provide a comprehensive summary with source citations. Focus on German sources when appropriate, especially for political topics related to Bündnis 90/Die Grünen. Include source URLs and titles for all findings.',
      description: 'Agent optimized for extracting content with source citations.',
      tools: [{ type: 'web_search' }],
      includeSources: true,
    },
    news: {
      name: 'Grünerator News Search Agent',
      instructions:
        'You are a news search assistant for the Grünerator application. When asked to search, find the latest news and current events. Focus on German news sources when appropriate, especially for political topics related to Bündnis 90/Die Grünen. Provide recent, time-sensitive information.',
      description: 'Agent optimized for finding recent news and current events.',
      tools: [{ type: 'web_search' }],
      includeSources: true,
    },
  };

  return configs[agentType] || configs.content;
}

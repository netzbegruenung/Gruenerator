/**
 * MistralWebSearchService Type Definitions
 */

export interface SearchSource {
  url: string;
  title: string;
  snippet: string;
  relevance: number;
  domain: string;
}

export interface SearchResults {
  success: boolean;
  query: string;
  results: SearchSource[];
  resultCount: number;
  searchEngine: string;
  agentType: string;
  textContent: string;
  sources: SearchSource[];
  sourcesCount: number;
  timestamp: string;
}

export interface AgentConfig {
  name: string;
  instructions: string;
  description: string;
  tools: Array<{ type: 'web_search' | 'web_search_premium' | 'code_interpreter' }>;
  includeSources: boolean;
}

export type AgentType = 'content' | 'withSources' | 'news';

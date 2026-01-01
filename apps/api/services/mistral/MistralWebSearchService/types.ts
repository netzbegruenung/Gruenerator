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
  results: any[];
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
  tools: Array<{ type: string }>;
  includeSources: boolean;
}

export type AgentType = 'content' | 'withSources' | 'news';

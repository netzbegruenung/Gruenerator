/**
 * Search Types
 * Platform-agnostic type definitions for search functionality
 */

export interface SearchResult {
  url: string;
  title: string;
  content?: string;
  content_snippets?: string;
  snippet?: string;
  domain?: string;
}

export interface Citation {
  id: string;
  sourceIndex: number;
  text?: string;
}

export interface SourceReference {
  index: number;
  title: string;
  url: string;
  domain?: string;
}

export interface WebSearchSummary {
  text: string;
  generated?: boolean;
}

export interface WebSearchResponse {
  success: boolean;
  results: SearchResult[];
  resultCount: number;
  summary?: WebSearchSummary;
  suggestions?: string[];
  citations?: Citation[];
  sources?: SourceReference[];
}

export interface DeepSearchResponse {
  status: 'success' | 'error';
  dossier: string;
  sources?: SearchResult[];
  categorizedSources: Record<string, SearchResult[]>;
  researchQuestions: string[];
  citations?: Citation[];
  citationSources?: SourceReference[];
}

export interface AnalysisResponse {
  status: 'success' | 'error';
  analysis: string;
  sourceRecommendations?: SourceRecommendation[];
  claudeSourceTitles?: string[];
}

export interface SourceRecommendation {
  title: string;
  summary: string;
}

export interface SearchState {
  results: SearchResult[];
  usedSources: SearchResult[];
  analysis: string | null;
  error: string | null;
  sourceRecommendations: SourceRecommendation[];
  dossier: string | null;
  categorizedSources: Record<string, SearchResult[]>;
  researchQuestions: string[];
  webResults: WebSearchResponse | null;
  citations: Citation[];
  citationSources: SourceReference[];
}

export interface UseSearchReturn extends SearchState {
  loading: boolean;
  search: (query: string) => Promise<void>;
  deepSearch: (query: string) => Promise<void>;
  webSearch: (query: string) => Promise<void>;
  clearAllResults: () => void;
}

export type SearchMode = 'web' | 'deep' | 'standard';

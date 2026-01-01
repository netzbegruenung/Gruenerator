/**
 * Shared TypeScript Types for Search Services
 */

// ============================================================================
// SearxngService Types
// ============================================================================

export interface SearxngSearchOptions {
  timeout?: number;
  maxResults?: number;
  language?: string;
  safesearch?: number;
  categories?: string;
  time_range?: string;
  page?: number;
  format?: string;
}

export interface SearchResult {
  rank: number;
  title: string;
  url: string;
  content: string;
  snippet: string;
  publishedDate: string | null;
  engine: string;
  score: number;
  category: string;
  domain: string;
  metadata: {
    length: number;
    hasContent: boolean;
  };
}

export interface ContentStats {
  totalResults: number;
  resultsWithContent: number;
  averageContentLength: number;
  uniqueDomains: number;
  topDomains: string[];
}

export interface FormattedSearchResults {
  success: boolean;
  query: string;
  results: SearchResult[];
  resultCount: number;
  totalResults: number;
  searchEngine: string;
  timestamp: string;
  searchOptions: {
    categories: string;
    language: string;
    maxResults: number;
  };
  contentStats: ContentStats;
  suggestions: string[];
  infoboxes: any[];
  answers: any[];
}

export interface SearxngSummary {
  text: string;
  generated: boolean;
  model?: string;
  timestamp?: string;
  wordCount?: number;
  basedOnResults?: number;
  error?: string;
}

export interface FormattedSearchResultsWithSummary extends FormattedSearchResults {
  summary?: SearxngSummary;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export interface ServiceStatus {
  baseUrl: string;
  cache: {
    type: 'redis' | 'memory';
    size: number;
    connected: boolean;
    error?: string;
  };
  cacheTimeout: number;
  newsCache: number;
  defaultOptions: SearxngSearchOptions;
  uptime: number;
  timestamp: string;
}

// ============================================================================
// SearchResultProcessor Types
// ============================================================================

export interface SearchResultInput {
  title?: string;
  document_title?: string;
  filename?: string;
  top_chunks?: Array<{
    preview?: string;
    chunk_index: number;
    page_number?: number | null;
  }>;
  source_url?: string;
  url?: string;
  document_id?: string;
  similarity_score?: number;
  relevant_content?: string;
  chunk_text?: string;
  chunk_index?: number;
}

export interface ExpandedChunkResult {
  document_id: string;
  source_url: string | null;
  title: string;
  snippet: string;
  filename: string | null;
  similarity: number;
  chunk_index: number;
  page_number: number | null;
  collection_id?: string;
  collection_name?: string;
}

export interface ReferenceData {
  title: string;
  snippets: string[][];
  description: string | null;
  date: string;
  source: string;
  document_id: string;
  source_url: string | null;
  filename: string | null;
  similarity_score: number;
  chunk_index: number;
  page_number: number | null;
  collection_id?: string;
  collection_name?: string;
}

export interface ReferencesMap {
  [id: string]: ReferenceData;
}

export interface Citation {
  index: string;
  cited_text: string;
  document_title: string;
  document_id: string;
  source_url: string | null;
  similarity_score: number;
  chunk_index: number;
  filename: string | null;
  page_number: number | null;
  collection_id?: string;
  collection_name?: string;
}

export interface Source {
  document_id: string;
  document_title: string;
  source_url: string | null;
  chunk_text: string;
  similarity_score: number;
  citations: Citation[];
}

export interface ValidationResult {
  cleanDraft: string;
  citations: Citation[];
  sources: Source[];
  errors: string[] | null;
}

export interface FilterOptions {
  threshold?: number;
  limit?: number;
}

export interface DedupeOptions {
  limitPerDoc?: number;
  maxTotal?: number;
}

export interface CollectionConfig {
  name: string;
  [key: string]: any;
}

export interface CollectionSources {
  name: string;
  sources: Source[];
  allSources: ExpandedChunkResult[];
}

export interface SourcesByCollection {
  [collectionId: string]: CollectionSources;
}

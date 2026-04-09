/**
 * Shared TypeScript Types for Search Services
 */

// ============================================================================
// SearxngService Types
// ============================================================================

export interface SearxngSearchOptions {
  timeout?: number | undefined;
  maxResults?: number | undefined;
  language?: string | undefined;
  safesearch?: number | undefined;
  categories?: string | undefined;
  time_range?: string | undefined;
  page?: number | undefined;
  format?: string | undefined;
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
  [key: string]: unknown;
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
  infoboxes: Record<string, unknown>[];
  answers: string[];
}

export interface SearxngSummary {
  text: string;
  generated: boolean;
  model?: string | undefined;
  timestamp?: string | undefined;
  wordCount?: number | undefined;
  basedOnResults?: number | undefined;
  error?: string | undefined;
}

export interface FormattedSearchResultsWithSummary extends FormattedSearchResults {
  summary?: SearxngSummary | undefined;
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
    error?: string | undefined;
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
  title?: string | undefined;
  document_title?: string | undefined;
  filename?: string | undefined;
  top_chunks?: Array<{
    preview?: string | undefined;
    chunk_index: number;
    page_number?: number | null | undefined;
  }>;
  source_url?: string | undefined;
  url?: string | undefined;
  document_id?: string | undefined;
  source_id?: string | null | undefined;
  similarity_score?: number | undefined;
  relevant_content?: string | undefined;
  chunk_text?: string | undefined;
  chunk_index?: number | undefined;
}

export interface ExpandedChunkResult {
  document_id: string;
  source_url: string | null;
  source_id?: string | null | undefined;
  title: string;
  snippet: string;
  filename: string | null;
  similarity: number;
  chunk_index: number;
  page_number: number | null;
  collection_id?: string | undefined;
  collection_name?: string | undefined;
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
  collection_id?: string | undefined;
  collection_name?: string | undefined;
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
  collection_id?: string | undefined;
  collection_name?: string | undefined;
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
  threshold?: number | undefined;
  limit?: number | undefined;
}

export interface DedupeOptions {
  limitPerDoc?: number | undefined;
  maxTotal?: number | undefined;
}

export interface CollectionConfig {
  name: string;
  [key: string]: unknown;
}

export interface CollectionSources {
  name: string;
  sources: Source[];
  allSources: ExpandedChunkResult[];
}

export interface SourcesByCollection {
  [collectionId: string]: CollectionSources;
}

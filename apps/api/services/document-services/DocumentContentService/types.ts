/**
 * Type definitions for DocumentContentService
 * Defines interfaces for content search operations
 */

/**
 * Content search options
 */
export interface ContentSearchOptions {
  query: string;
  documentIds: string[];
  limit?: number;
  mode?: 'hybrid' | 'vector' | 'keyword';
}

/**
 * Document content result
 */
export interface DocumentContentResult {
  document_id: string;
  title: string;
  filename: string | null;
  vector_count: number;
  content_type: 'vector_search' | 'full_text_from_vectors' | 'intelligent_excerpt_from_vectors' | 'no_content';
  content: string;
  similarity_score: number | null;
  search_info: string;
}

/**
 * Content search response
 */
export interface ContentSearchResponse {
  success: boolean;
  results: DocumentContentResult[];
  query: string;
  search_mode: string;
  metadata: ContentSearchMetadata;
}

/**
 * Content search metadata
 */
export interface ContentSearchMetadata {
  response_time_ms: number;
  documents_processed: number;
  vector_search_results: number;
  content_type_breakdown: Record<string, number>;
  processing_version: string;
  user_id: string;
}

/**
 * Content strategy decision
 */
export interface ContentStrategyDecision {
  useFullContent: boolean;
  reason: string;
}

/**
 * Excerpt options
 */
export interface ExcerptOptions {
  maxLength?: number;
  contextSize?: number;
}

/**
 * Text match location
 */
export interface TextMatch {
  index: number;
  term: string;
  length: number;
}

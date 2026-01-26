/**
 * Type definitions for Notebook QA Service
 */

import type {
  ExpandedChunkResult,
  Citation as SearchCitation,
  Source as SearchSource,
  SourcesByCollection as SearchSourcesByCollection,
} from '../search/types.js';

/**
 * Request filters for search
 */
export interface RequestFilters {
  [key: string]: any;
}

/**
 * Citation in QA response
 * Can be either a search citation or a custom citation format
 */
export interface Citation {
  index: string;
  title?: string;
  url?: string | null;
  snippet?: string;
  source?: string;
  type?: string;
  cited_text?: string;
  document_title?: string;
  document_id?: string;
  source_url?: string | null;
  similarity_score?: number;
  chunk_index?: number;
  filename?: string | null;
  page_number?: number | null;
  collection_id?: string;
  collection_name?: string;
}

/**
 * Multi-collection metadata
 */
export interface MultiCollectionMetadata {
  response_time_ms: number;
  collections_queried: string[];
  document_scope_detected: string | null;
  document_title_filter: string | null;
  subcategory_filters_applied: Record<string, any> | null;
  total_results: number;
  citations_count: number;
  fast_mode?: boolean;
}

/**
 * Single collection metadata
 */
export interface SingleCollectionMetadata {
  collection_id: string;
  collection_name: string;
  response_time_ms: number;
  sources_count: number;
  citations_count: number;
  subcategory_filters_applied: Record<string, any> | null;
  fast_mode?: boolean;
}

/**
 * Person query metadata (extends single collection)
 */
export interface PersonQueryMetadata extends SingleCollectionMetadata {
  extractedName?: string;
  detectionConfidence: number;
  detectionSource?: string;
  contentMentionsCount: number;
  drucksachenCount: number;
  aktivitaetenCount: number;
}

/**
 * Person information in person query response
 */
export interface PersonInfo {
  name?: string;
  fraktion?: string | string[];
  wahlkreis?: string;
  biografie?: string;
}

/**
 * QA response structure
 */
export interface QAResponse {
  success: boolean;
  answer: string;
  citations: Citation[];
  sources: SearchSource[] | Citation[] | ExpandedChunkResult[];
  allSources: SearchSource[] | Citation[] | ExpandedChunkResult[];
  sourcesByCollection?: SearchSourcesByCollection;
  metadata: MultiCollectionMetadata | SingleCollectionMetadata | PersonQueryMetadata;
  isPersonQuery?: boolean;
  person?: PersonInfo;
}

/**
 * Parameters for multi-collection QA
 */
export interface QAMultiCollectionParams {
  question: string;
  collectionIds?: string[];
  requestFilters?: RequestFilters;
  aiWorkerPool: any;
  fastMode?: boolean;
}

/**
 * Parameters for single-collection QA
 */
export interface QASingleCollectionParams {
  collectionId: string;
  question: string;
  userId: string;
  requestFilters?: RequestFilters;
  aiWorkerPool: any;
  getCollectionFn?: (collectionId: string) => Promise<any>;
  getDocumentIdsFn?: (collectionId: string) => Promise<string[]>;
  fastMode?: boolean;
}

/**
 * Search parameters for internal use
 */
export interface SearchParams {
  limit: number;
  mode: string;
  vectorWeight: number;
  textWeight: number;
  threshold: number;
  recallLimit?: number;
  qualityMin?: number;
}

/**
 * Internal search options
 */
export interface InternalSearchOptions {
  query: string;
  searchCollection: string;
  userId: string | null;
  documentIds?: string[];
  titleFilter?: string;
  additionalFilter?: any;
  searchParams: SearchParams;
}

/**
 * Document scope detection result
 */
export interface DocumentScope {
  detectedPhrase?: string;
  collections: string[];
  subcategoryFilters: Record<string, any>;
  documentTitleFilter?: string;
}

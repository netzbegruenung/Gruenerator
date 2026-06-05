/**
 * Type definitions for Notebook QA Service
 */

import type { AIWorkerPool } from '../../workers/types.js';
import type { QdrantFilter } from '../QueryIntentService/types.js';
import type {
  ExpandedChunkResult,
  Source as SearchSource,
  SourcesByCollection as SearchSourcesByCollection,
  ReferencesMap,
} from '../search/types.js';
import type { NotebookCitation } from '@gruenerator/contracts';

/**
 * Request filters for search
 */
export interface RequestFilters {
  [key: string]: unknown;
}

/**
 * Citation in QA response. Single source of truth lives in the contract
 * (`notebookCitationSchema`); we alias the inferred type so the service, the
 * HTTP response, and the frontend all share one shape. Carries `date` (real
 * publication/upload date of the source, or null).
 */
export type Citation = NotebookCitation;

/**
 * Multi-collection metadata
 */
export interface MultiCollectionMetadata {
  response_time_ms: number;
  collections_queried: string[];
  document_scope_detected: string | null;
  document_title_filter: string | null;
  subcategory_filters_applied: Record<string, unknown> | null;
  total_results: number;
  citations_count: number;
  fast_mode?: boolean | undefined;
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
  subcategory_filters_applied: Record<string, unknown> | null;
  fast_mode?: boolean | undefined;
  // Set on empty-result responses for user collections so callers (and the
  // chat respondNode) can distinguish "still indexing" / "failed" / "ready".
  corpus_state?: 'indexing' | 'failed' | 'ready' | undefined;
  corpus_state_detail?:
    | {
        indexing_count: number;
        failed_count: number;
        ready_count: number;
        total_count: number;
      }
    | undefined;
}

/**
 * Person query metadata (extends single collection)
 */
export interface PersonQueryMetadata extends SingleCollectionMetadata {
  extractedName?: string | undefined;
  detectionConfidence: number;
  detectionSource?: string | undefined;
  contentMentionsCount: number;
  drucksachenCount: number;
  aktivitaetenCount: number;
}

/**
 * Person information in person query response
 */
export interface PersonInfo {
  name?: string | undefined;
  fraktion?: string | string[] | undefined;
  wahlkreis?: string | undefined;
  biografie?: string | undefined;
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
  sourcesByCollection?: SearchSourcesByCollection | undefined;
  metadata: MultiCollectionMetadata | SingleCollectionMetadata | PersonQueryMetadata;
  isPersonQuery?: boolean | undefined;
  person?: PersonInfo | undefined;
}

/**
 * Parameters for multi-collection QA
 */
export interface QAMultiCollectionParams {
  question: string;
  collectionIds?: string[] | undefined;
  requestFilters?: RequestFilters | undefined;
  aiWorkerPool: AIWorkerPool;
  fastMode?: boolean | undefined;
}

/**
 * Parameters for single-collection QA
 */
export interface QASingleCollectionParams {
  collectionId: string;
  question: string;
  userId: string;
  requestFilters?: RequestFilters | undefined;
  aiWorkerPool: AIWorkerPool;
  getCollectionFn?: (
    collectionId: string
  ) => Promise<{ name: string; user_id: string | null } | null>;
  getDocumentIdsFn?: (collectionId: string) => Promise<string[]>;
  fastMode?: boolean | undefined;
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
  recallLimit?: number | undefined;
  qualityMin?: number | undefined;
}

/**
 * Internal search options
 */
export interface InternalSearchOptions {
  query: string;
  searchCollection: string;
  userId: string | null;
  documentIds?: string[] | undefined;
  titleFilter?: string | undefined;
  additionalFilter?: QdrantFilter | undefined;
  searchParams: SearchParams;
}

/**
 * Document scope detection result
 */
export interface DocumentScope {
  detectedPhrase?: string | undefined;
  collections: string[];
  subcategoryFilters: Record<string, string | string[] | undefined>;
  documentTitleFilter?: string | undefined;
}

/**
 * Search context result for streaming
 * Contains all the data needed to generate an answer without the AI generation step
 */
export interface SearchContext {
  referencesMap: ReferencesMap;
  sortedResults: ExpandedChunkResult[];
  systemPrompt: string;
  contextSummary: string;
  collectionName?: string | undefined;
  isMulti: boolean;
  effectiveCollectionIds?: string[] | undefined;
  documentScope?: DocumentScope | undefined;
  effectiveFilters?: RequestFilters | undefined;
}

/**
 * Parameters for getting search context
 */
export interface GetSearchContextParams {
  question: string;
  collectionId?: string | undefined;
  collectionIds?: string[] | undefined;
  userId?: string | undefined;
  requestFilters?: RequestFilters | undefined;
  getCollectionFn?: (
    collectionId: string
  ) => Promise<{ name: string; user_id: string | null } | null>;
  getDocumentIdsFn?: (collectionId: string) => Promise<string[]>;
}

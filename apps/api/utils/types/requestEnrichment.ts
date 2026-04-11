/**
 * Type definitions for RequestEnrichment service
 */

import { type ContentExample } from '../../agents/langgraph/types/promptAssembly.js';
import { type ClaudeTool } from '../../services/tools/types.js';
import { type AIWorkerPool } from '../../workers/types.js';

export type Locale = 'de-DE' | 'de-AT';

export interface EnrichmentOptions {
  type: string;
  enableUrls?: boolean | undefined;
  enableWebSearch?: boolean | undefined;
  enableDocQnA?: boolean | undefined;
  usePrivacyMode?: boolean | undefined;
  useProMode?: boolean | undefined;
  webSearchQuery?: string | null | undefined;
  systemRole?: string | null | undefined;
  constraints?: string | null | undefined;
  formatting?: string | null | undefined;
  taskInstructions?: string | null | undefined;
  outputFormat?: string | null | undefined;
  examples?: ContentExample[] | undefined;
  toolInstructions?: string[] | undefined;
  knowledgeContent?: string | null | undefined;
  instructions?: string | null | undefined;
  selectedDocumentIds?: string[] | undefined;
  selectedTextIds?: string[] | undefined;
  searchQuery?: string | null | undefined;
  provider?: string | undefined;
  aiWorkerPool?: AIWorkerPool;
  req?: unknown | undefined;
  enableNotebookEnrich?: boolean | undefined;
  notebookEnrichPrompt?: string | undefined;
}

export interface Document {
  type: 'text' | 'document' | 'image';
  source: {
    type: 'base64' | 'text';
    media_type?: string | undefined;
    data?: string | undefined;
    text?: string | undefined;
    document?: {
      type: string;
      data?: string | undefined;
    };
    image?: {
      type: string;
      data?: string | undefined;
    };
    metadata?:
      | Record<string, unknown>
      | {
          title: string;
          url?: string | undefined;
          wordCount?: number | undefined;
          extractedAt?: string | undefined;
          contentSource: 'url_crawl' | 'attachment' | 'database';
          filename?: string | undefined;
          fileSize?: number | undefined;
          pageCount?: number | undefined;
          chunkCount?: number | undefined;
        };
  };
}

export interface WebSearchSource {
  title: string;
  url: string;
  domain: string;
}

export interface DocumentReference {
  title: string;
  filename: string;
  pageCount?: number | undefined;
  retrievalMethod: 'full_text' | 'vector_search';
  relevance?: number | undefined;
}

export interface TextReference {
  title: string;
  type: string;
  wordCount: number;
  createdAt: string;
}

export interface EnrichmentMetadata {
  totalDocuments: number;
  enableDocQnA: boolean;
  webSearchSources: WebSearchSource[] | null;
  usePrivacyMode: boolean;
  urlsProcessed?: string[] | undefined;
  documentsPreProcessed?: boolean | undefined;
  documentsReferences?: DocumentReference[] | undefined;
  textsReferences?: TextReference[] | undefined;
  notebookEnrichUsed?: boolean | undefined;
  notebookEnrichLength?: number | undefined;
  notebookEnrichTimeMs?: number | undefined;
  [key: string]: unknown;
}

export interface EnrichedState {
  type: string;
  provider?: string | undefined;
  locale: Locale;
  systemRole: string | null;
  constraints: string | null;
  formatting: string | null;
  taskInstructions: string | null;
  outputFormat: string | null;
  documents: Document[];
  knowledge: string[];
  instructions: string | null;
  request: Record<string, unknown>;
  examples: ContentExample[];
  toolInstructions: string[];
  selectedDocumentIds: string[];
  selectedTextIds: string[];
  searchQuery: string | null;
  useProMode: boolean;
  enrichmentMetadata?: EnrichmentMetadata | undefined;
  requestFormatted?: string | undefined;
  tools?: ClaudeTool[] | undefined;
}

export interface VectorSearchResult {
  document_id: string;
  title: string;
  filename: string;
  content_type: 'vector_search' | 'full_text' | 'intelligent_excerpt';
  search_info?: string | undefined;
  relevant_content: string;
  content?: string | undefined;
  similarity_score: number;
  page_count?: number | undefined;
}

export interface FullTextResult {
  id: string;
  fullText: string;
  chunkCount: number;
}

export interface HybridSearchResult {
  success: boolean;
  results: Array<{
    document_id: string;
    title: string;
    filename: string;
    relevant_content: string;
    similarity_score: number;
    matched_query?: string | undefined;
  }>;
}

export interface KnowledgeEntry {
  id?: string | undefined;
  title: string;
  content: string;
  created_at?: string | undefined;
}

export interface SavedText {
  id: string;
  content: string;
  type?: string | undefined;
  document_type?: string | undefined;
  title?: string | undefined;
  word_count?: number | undefined;
  created_at?: string | undefined;
}

export interface AttachmentProcessingResult {
  hasAttachments?: boolean | undefined;
  summary?: unknown | null | undefined;
  validated?: boolean | undefined;
  error?: string | null | undefined;
  documents?: Document[] | undefined;
}

export interface WebSearchResult {
  knowledge: string[];
  sources: WebSearchSource[] | null;
}

export interface DocumentSearchResult {
  knowledge: string[];
  metadata?: unknown | undefined;
  documentReferences?: DocumentReference[] | undefined;
  textReferences?: TextReference[] | undefined;
}

/**
 * Union type for all enrichment task results
 * Used to properly type the enrichmentTasks array
 */
export type EnrichmentTaskResult =
  | { type: 'urls'; documents: Document[] }
  | { type: 'websearch'; knowledge: string[]; sources: WebSearchSource[] | null }
  | { type: 'vectorsearch'; knowledge: string[]; documentReferences: DocumentReference[] }
  | { type: 'texts'; knowledge: string[]; textReferences: TextReference[] }
  | { type: 'knowledge'; knowledge: string[] }
  | { type: 'notebook_enrich'; preAnswer: string | null; timeMs: number };

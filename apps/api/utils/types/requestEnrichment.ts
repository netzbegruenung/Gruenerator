/**
 * Type definitions for RequestEnrichment service
 */

export type Locale = 'de-DE' | 'de-AT';

export interface EnrichmentOptions {
  type: string;
  enableUrls?: boolean;
  enableWebSearch?: boolean;
  enableDocQnA?: boolean;
  usePrivacyMode?: boolean;
  useProMode?: boolean;
  webSearchQuery?: string | null;
  systemRole?: string | null;
  constraints?: string | null;
  formatting?: string | null;
  taskInstructions?: string | null;
  outputFormat?: string | null;
  examples?: any[];
  toolInstructions?: string[];
  knowledgeContent?: string | null;
  instructions?: string | null;
  selectedDocumentIds?: string[];
  selectedTextIds?: string[];
  searchQuery?: string | null;
  useAutomaticSearch?: boolean;
  provider?: string;
  aiWorkerPool?: any;
  req?: any;
}

export interface Document {
  type: 'text' | 'document' | 'image';
  source: {
    type: 'base64' | 'text';
    media_type?: string;
    data?: string;
    text?: string;
    document?: {
      type: string;
      data?: string;
    };
    image?: {
      type: string;
      data?: string;
    };
    metadata?: {
      title: string;
      url?: string;
      wordCount?: number;
      extractedAt?: string;
      contentSource: 'url_crawl' | 'attachment' | 'database';
      filename?: string;
      fileSize?: number;
      pageCount?: number;
      chunkCount?: number;
    };
  };
}

export interface WebSearchSource {
  title: string;
  url: string;
  domain: string;
}

export interface AutoSelectedDocument {
  id: string;
  title: string;
  filename: string;
  relevance_score: number;
  relevance_percent: number;
  matched_query: string;
}

export interface DocumentReference {
  title: string;
  filename: string;
  pageCount?: number;
  retrievalMethod: 'full_text' | 'vector_search';
  relevance?: number;
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
  autoSearchUsed: boolean;
  autoSelectedDocuments: AutoSelectedDocument[];
  urlsProcessed?: string[];
  documentsPreProcessed?: boolean;
  documentsReferences?: DocumentReference[];
  textsReferences?: TextReference[];
  [key: string]: unknown;
}

export interface EnrichedState {
  type: string;
  provider?: string;
  locale: Locale;
  systemRole: string | null;
  constraints: string | null;
  formatting: string | null;
  taskInstructions: string | null;
  outputFormat: string | null;
  documents: Document[];
  knowledge: string[];
  instructions: string | null;
  request: any;
  examples: any[];
  toolInstructions: string[];
  selectedDocumentIds: string[];
  selectedTextIds: string[];
  searchQuery: string | null;
  useProMode: boolean;
  enrichmentMetadata?: EnrichmentMetadata;
  requestFormatted?: string;
  tools?: any[];
}

export interface VectorSearchResult {
  document_id: string;
  title: string;
  filename: string;
  content_type: 'vector_search' | 'full_text' | 'intelligent_excerpt';
  search_info?: string;
  relevant_content: string;
  content?: string;
  similarity_score: number;
  page_count?: number;
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
    matched_query?: string;
  }>;
}

export interface KnowledgeEntry {
  id?: string;
  title: string;
  content: string;
  created_at?: string;
}

export interface SavedText {
  id: string;
  content: string;
  type?: string;
  document_type?: string;
  title?: string;
  word_count?: number;
  created_at?: string;
}

export interface AttachmentProcessingResult {
  hasAttachments?: boolean;
  summary?: any | null;
  validated?: boolean;
  error?: string | null;
  documents?: Document[];
}

export interface WebSearchResult {
  knowledge: string[];
  sources: WebSearchSource[] | null;
}

export interface DocumentSearchResult {
  knowledge: string[];
  metadata?: any;
  documentReferences?: any[];
  textReferences?: any[];
}

export interface AutoSearchOptions {
  limit?: number;
  threshold?: number;
  usePrivacyMode?: boolean;
  useProMode?: boolean;
}

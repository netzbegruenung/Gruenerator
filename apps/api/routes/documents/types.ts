/**
 * Shared type definitions for document routes
 */

import type { AuthenticatedRequest } from '../../middleware/types.js';
import type { Request } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';

// Use Express.Request directly - it already has user?: Express.User with proper type augmentation
export type DocumentRequest<P = ParamsDictionary> = Request<P>;

// Re-export for convenience
export type { AuthenticatedRequest };

// ============================================================================
// Request Body Types
// ============================================================================

export interface UploadManualRequestBody {
  title: string;
}

export interface AddTextRequestBody {
  title: string;
  content: string;
}

export interface SetModeRequestBody {
  mode: 'manual' | 'wolke';
}

export interface WolkeSyncRequestBody {
  shareLinkId: string;
  folderPath?: string | undefined;
}

export interface WolkeAutoSyncRequestBody {
  shareLinkId: string;
  folderPath?: string | undefined;
  enabled: boolean;
}

export interface WolkeFileInfo {
  name: string;
  href: string;
  size?: number | undefined;
  lastModified?: Date | undefined;
}

export interface WolkeImportRequestBody {
  shareLinkId: string;
  files: WolkeFileInfo[];
}

export interface SearchDocumentsRequestBody {
  query: string;
  limit?: number | undefined;
  searchMode?: 'hybrid' | 'text' | 'vector' | undefined;
  documentIds?: string[] | undefined;
}

export interface SearchContentRequestBody {
  query: string;
  documentIds: string[];
  limit?: number | undefined;
  mode?: 'hybrid' | 'keyword' | 'vector' | undefined;
}

export interface BulkDeleteRequestBody {
  ids: string[];
}

export interface CrawlUrlRequestBody {
  url: string;
  title: string;
}

export interface BulkFullTextRequestBody {
  documentIds: string[];
}

// ============================================================================
// Query Parameter Types
// ============================================================================

export interface GetDocumentsBySourceQuery {
  sourceType?: 'manual' | 'wolke' | undefined;
}

export interface QdrantListQuery {
  sourceType?: string | undefined;
  limit?: string | undefined;
}

// ============================================================================
// Response Types
// ============================================================================

export interface DocumentResponse {
  id: string;
  title: string;
  filename: string | null;
  source_type: string;
  status: string;
  vector_count: number;
  file_size: number;
  created_at: string;
  content_preview?: string | null | undefined;
  full_content?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface EnrichedDocument extends DocumentResponse {
  content_preview: string | null;
  full_content: string | null;
}

export interface UserTextDocument {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at?: string | undefined;
}

export interface CombinedContentResponse {
  documents: EnrichedDocument[];
  texts: UserTextDocument[];
}

export interface DocumentStats {
  total: number;
  manual: number;
  wolke: number;
  totalVectors: number;
}

export interface WolkeImportResult {
  filename: string;
  success: boolean;
  skipped?: boolean | undefined;
  reason?: string | undefined;
  documentId?: string | undefined;
  vectorsCreated?: number | undefined;
  error?: string | undefined;
}

export interface WolkeBrowseFile extends WolkeFileInfo {
  fileExtension: string;
  isSupported: boolean;
  sizeFormatted: string;
  lastModifiedFormatted: string;
}

export interface QdrantFullTextResult {
  id: string;
  fullText: string;
  chunkCount: number;
  metadata: Record<string, unknown>;
}

export interface BulkFullTextResult {
  documents: QdrantFullTextResult[];
  errors: Array<{ documentId: string; error: string }>;
  stats: {
    requested: number;
    accessible: number;
    retrieved: number;
    failed: number;
  };
}

export interface SearchResultCompatible {
  id: string;
  title: string;
  filename: string;
  relevantText: string;
  created_at: string;
  similarity_score: number;
  relevance_info?: string | undefined;
  search_type: string;
}

export interface HybridTestResult {
  query: string;
  vector_search: unknown;
  hybrid_search: unknown;
}

// ============================================================================
// Generic API Response Types
// ============================================================================

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data?: T | undefined;
  message?: string | undefined;
  meta?: Record<string, unknown> | undefined;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  error?: string | undefined;
}

// ============================================================================
// Processing Result Types
// ============================================================================

export interface ProcessedUploadResult {
  documentId: string;
  vectorsCreated: number;
  status: string;
}

export interface ProcessedTextResult {
  documentId: string;
  vectorsCreated: number;
  status: string;
}

export interface ProcessedUrlResult {
  documentId: string;
  vectorsCreated: number;
  status: string;
  url: string;
}

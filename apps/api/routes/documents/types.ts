/**
 * Shared type definitions for document routes
 */

import type { Request } from 'express';
import type { AuthenticatedRequest } from '../../middleware/types.js';

// Use Express.Request directly - it already has user?: Express.User with proper type augmentation
export type DocumentRequest = Request;

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
  folderPath?: string;
}

export interface WolkeAutoSyncRequestBody {
  shareLinkId: string;
  folderPath?: string;
  enabled: boolean;
}

export interface WolkeFileInfo {
  name: string;
  href: string;
  size?: number;
  lastModified?: Date;
}

export interface WolkeImportRequestBody {
  shareLinkId: string;
  files: WolkeFileInfo[];
}

export interface SearchDocumentsRequestBody {
  query: string;
  limit?: number;
  searchMode?: 'hybrid' | 'text' | 'vector';
  documentIds?: string[];
}

export interface SearchContentRequestBody {
  query: string;
  documentIds: string[];
  limit?: number;
  mode?: 'hybrid' | 'keyword' | 'vector';
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
  sourceType?: 'manual' | 'wolke';
}

export interface QdrantListQuery {
  sourceType?: string;
  limit?: string;
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
  content_preview?: string | null;
  full_content?: string | null;
  metadata?: any;
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
  updated_at?: string;
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
  skipped?: boolean;
  reason?: string;
  documentId?: string;
  vectorsCreated?: number;
  error?: string;
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
  metadata: any;
}

export interface BulkFullTextResult {
  documents: QdrantFullTextResult[];
  errors: any[];
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
  relevance_info?: string;
  search_type: string;
}

export interface HybridTestResult {
  query: string;
  vector_search: any;
  hybrid_search: any;
}

// ============================================================================
// Generic API Response Types
// ============================================================================

export interface ApiSuccessResponse<T = any> {
  success: true;
  data?: T;
  message?: string;
  meta?: Record<string, any>;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  error?: string;
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

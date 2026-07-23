/**
 * Type definitions for PostgresDocumentService
 * Defines interfaces for document metadata, records, and user preferences
 */

/**
 * User document mode preference
 */
export type UserDocumentMode = 'manual' | 'wolke';

/**
 * Document metadata for creation/updates
 */
export interface DocumentMetadata {
  title: string;
  filename?: string | null | undefined;
  sourceType?: string | undefined;
  wolkeShareLinkId?: string | null | undefined;
  wolkeFilePath?: string | null | undefined;
  wolkeEtag?: string | null | undefined;
  vectorCount?: number | undefined;
  fileSize?: number | undefined;
  status?: string | undefined;
  sourceUrl?: string | null | undefined;
  additionalMetadata?: Record<string, unknown> | null | undefined;
}

/**
 * Document record from database
 */
export interface DocumentRecord {
  id: string;
  user_id: string;
  title: string;
  filename?: string | null | undefined;
  source_type: string;
  wolke_share_link_id?: string | null | undefined;
  wolke_file_path?: string | null | undefined;
  wolke_etag?: string | null | undefined;
  vector_count: number;
  file_size: number;
  status: string;
  metadata?: Record<string, unknown> | null | undefined;
  created_at: string;
  updated_at: string;
  last_synced_at?: string | null | undefined;
  [key: string]: unknown;
}

/**
 * Document update data
 */
export interface DocumentUpdateData {
  title?: string | undefined;
  status?: string | undefined;
  vectorCount?: number | undefined;
  wolkeEtag?: string | undefined;
  lastSyncedAt?: string | undefined;
  additionalMetadata?: Record<string, unknown> | undefined;
}

/**
 * User text document
 */
export interface UserTextDocument {
  id: string;
  title: string;
  content: string;
  document_type: string;
  created_at: string;
  updated_at: string;
  word_count: number;
  character_count: number;
}

/**
 * Document statistics
 */
export interface DocumentStats {
  totalDocuments: number;
  manualDocuments: number;
  wolkeDocuments: number;
  completedDocuments: number;
  processingDocuments: number;
  failedDocuments: number;
  totalVectorCount: number;
}

/**
 * Bulk delete result
 */
export interface BulkDeleteResult {
  success: boolean;
  deletedCount: number;
  deletedIds: string[];
}

/**
 * User document mode result
 */
export interface UserDocumentModeResult {
  mode: UserDocumentMode;
  success: boolean;
}

/**
 * Delete result
 */
export interface DeleteResult {
  success: boolean;
  deletedId: string;
}

/**
 * Document with text
 */
export interface DocumentWithText extends DocumentRecord {
  text?: string | undefined;
}

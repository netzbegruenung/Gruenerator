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
  filename?: string | null;
  sourceType?: string;
  wolkeShareLinkId?: string | null;
  wolkeFilePath?: string | null;
  wolkeEtag?: string | null;
  vectorCount?: number;
  fileSize?: number;
  status?: string;
  additionalMetadata?: Record<string, any> | null;
}

/**
 * Document record from database
 */
export interface DocumentRecord {
  id: string;
  user_id: string;
  title: string;
  filename?: string | null;
  source_type: string;
  wolke_share_link_id?: string | null;
  wolke_file_path?: string | null;
  wolke_etag?: string | null;
  vector_count: number;
  file_size: number;
  status: string;
  metadata?: string | null;
  created_at: string;
  updated_at: string;
  last_synced_at?: string | null;
}

/**
 * Document update data
 */
export interface DocumentUpdateData {
  title?: string;
  status?: string;
  vectorCount?: number;
  wolkeEtag?: string;
  lastSyncedAt?: string;
  additionalMetadata?: Record<string, any>;
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
  text?: string;
}

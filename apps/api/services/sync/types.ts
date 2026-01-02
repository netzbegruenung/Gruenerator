/**
 * Sync Service Types
 *
 * Type definitions for Nextcloud/Wolke folder synchronization
 */

export interface WolkeSyncStatus {
  id: string;
  user_id: string;
  share_link_id: string;
  folder_path: string;
  sync_status: 'idle' | 'syncing' | 'completed' | 'failed';
  files_processed: number;
  files_failed: number;
  auto_sync_enabled: boolean;
  last_sync_at?: Date | string;
  created_at?: Date | string;
  updated_at?: Date | string;
}

export interface NextcloudFile {
  name: string;
  href: string;
  size: number;
  etag?: string;
  lastModified?: Date | string;
}

export interface FileProcessResult {
  success?: boolean;
  skipped?: boolean;
  reason?: string;
  documentId?: string;
  filename?: string;
  vectorsCreated?: number;
  isUpdate?: boolean;
  error?: string;
}

export interface SyncResult {
  success: boolean;
  syncStatusId: string;
  totalFiles: number;
  processedFiles: number;
  failedFiles: number;
  results: FileProcessResult[];
}

export interface FileChangeCheck {
  hasChanged: boolean;
  reason?: string;
  etag?: string;
  lastModified?: Date | string;
}

export interface ProcessedFileMetadata {
  file_path: string;
  etag?: string;
  last_modified?: Date | string;
  size: number;
  wolke_sync_status_id: string;
  user_id: string;
}

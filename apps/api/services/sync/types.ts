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
  last_sync_at?: Date | string | undefined;
  created_at?: Date | string | undefined;
  updated_at?: Date | string | undefined;
}

export interface NextcloudFile {
  name: string;
  href: string;
  size: number;
  etag?: string | undefined;
  lastModified?: Date | string | undefined;
}

export interface FileProcessResult {
  success?: boolean | undefined;
  skipped?: boolean | undefined;
  reason?: string | undefined;
  documentId?: string | undefined;
  filename?: string | undefined;
  vectorsCreated?: number | undefined;
  isUpdate?: boolean | undefined;
  error?: string | undefined;
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
  reason?: string | undefined;
  etag?: string | undefined;
  lastModified?: Date | string | undefined;
}

export interface ProcessedFileMetadata {
  file_path: string;
  etag?: string | undefined;
  last_modified?: Date | string | undefined;
  size: number;
  wolke_sync_status_id: string;
  user_id: string;
}

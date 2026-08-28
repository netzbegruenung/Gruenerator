/**
 * Sync Service Types
 *
 * Type definitions for Nextcloud/Wolke folder synchronization
 */

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

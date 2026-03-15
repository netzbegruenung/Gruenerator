export type WolkeScope = 'personal' | 'group';

export interface ShareLink {
  id: string;
  share_link?: string;
  label?: string;
  folder_name?: string;
  base_url?: string;
  share_token?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
  display_name?: string;
  user_id?: string;
}

export interface WolkeFileItem {
  path: string;
  name: string;
  size?: number;
  mimeType?: string;
  lastModified?: string;
  isDirectory?: boolean;
  fileExtension: string;
  isSupported: boolean;
  sizeFormatted: string;
  lastModifiedFormatted?: string;
}

export interface SyncStatus {
  share_link_id: string;
  folder_path: string;
  auto_sync_enabled: boolean;
  sync_status: 'idle' | 'syncing' | 'completed' | 'failed';
  last_sync_at: string | null;
  files_processed: number;
  files_failed: number;
  created_at?: string;
  updated_at?: string;
}

export interface ConnectionTestResult {
  success: boolean;
  message?: string;
}

export interface ShareLinkValidationResult {
  isValid: boolean;
  shareToken?: string;
  baseUrl?: string;
  error: string | null;
}

export interface ParsedShareLink {
  baseUrl: string;
  shareToken: string;
  fullPath: string;
}

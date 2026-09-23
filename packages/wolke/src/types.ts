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

export type ConnectionErrorCode =
  'invalid_link' | 'not_found' | 'forbidden' | 'file_drop' | 'unknown';

export interface ConnectionTestResult {
  success: boolean;
  message?: string;
  errorCode?: ConnectionErrorCode;
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

/**
 * A Wolke link that another user has shared into one of the caller's groups.
 * The link itself belongs to `sharedByUserId` — the caller only has read access
 * (open in Nextcloud, test connection) through the public share token.
 */
export interface SharedWithMeLink {
  link: ShareLink;
  sharedByUserId: string | null;
  sharedByName: string | null;
  groupId: string;
  groupName: string;
  sharedAt: string;
}

/**
 * A group that one of the caller's own links is currently shared with.
 */
export interface LinkGroupShare {
  groupId: string;
  groupName: string;
  sharedAt: string;
}

import apiClient from '@/components/utils/apiClient';

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

interface ParsedShareLink {
  baseUrl: string;
  shareToken: string;
  fullPath: string;
}

function getBasePath(scope?: WolkeScope, scopeId?: string | null): string {
  return scope === 'group' && scopeId ? `/groups/${scopeId}/wolke` : '/nextcloud';
}

// ── API Functions ──────────────────────────────────────────────────────

export async function fetchShareLinks(
  scope?: WolkeScope,
  scopeId?: string | null
): Promise<ShareLink[]> {
  const basePath = getBasePath(scope, scopeId);
  const response = await apiClient.get(`${basePath}/share-links`);
  if (response.data?.success) {
    return response.data.shareLinks || [];
  }
  throw new Error('Failed to fetch share links');
}

export async function addShareLink(
  url: string,
  label?: string,
  scope?: WolkeScope,
  scopeId?: string | null
): Promise<ShareLink> {
  const basePath = getBasePath(scope, scopeId);
  const response = await apiClient.post(`${basePath}/share-links`, {
    shareLink: url.trim(),
    label: (label || '').trim(),
  });
  if (response.data?.success && response.data.shareLink) {
    return response.data.shareLink;
  }
  throw new Error(response.data?.message || 'Failed to add share link');
}

export async function deleteShareLink(
  id: string,
  scope?: WolkeScope,
  scopeId?: string | null
): Promise<void> {
  const basePath = getBasePath(scope, scopeId);
  const response = await apiClient.delete(`${basePath}/share-links/${id}`);
  if (!response.data?.success) {
    throw new Error(response.data?.message || 'Failed to delete share link');
  }
}

export async function testConnection(
  shareLink: string,
  scope?: WolkeScope,
  scopeId?: string | null
): Promise<ConnectionTestResult> {
  const basePath = getBasePath(scope, scopeId);
  const response = await apiClient.post(`${basePath}/test-connection`, {
    shareLink: shareLink.trim(),
  });
  return response.data;
}

export async function uploadToWolke(
  shareLinkId: string,
  content: string,
  filename: string,
  folderPath?: string
): Promise<ConnectionTestResult> {
  const response = await apiClient.post('/nextcloud/upload', {
    shareLinkId,
    content,
    filename,
    ...(folderPath && { folderPath }),
  });
  return response.data;
}

export async function browseFolder(shareLinkId: string, path?: string): Promise<WolkeFileItem[]> {
  const url = path
    ? `/documents/wolke/browse/${shareLinkId}?path=${encodeURIComponent(path)}`
    : `/documents/wolke/browse/${shareLinkId}`;
  const response = await apiClient.get(url);
  if (response.data?.success) {
    return response.data.files || [];
  }
  throw new Error('Failed to browse folder');
}

export async function fetchSyncStatuses(
  scope?: WolkeScope,
  scopeId?: string | null
): Promise<SyncStatus[]> {
  const basePath = scope === 'group' && scopeId ? `/groups/${scopeId}/wolke` : '/documents/wolke';
  const response = await apiClient.get(`${basePath}/sync-status`);
  if (response.data?.success) {
    return response.data.syncStatuses || [];
  }
  throw new Error('Failed to fetch sync statuses');
}

export async function syncFolder(
  shareLinkId: string,
  folderPath: string = '',
  scope?: WolkeScope,
  scopeId?: string | null
): Promise<ConnectionTestResult> {
  const basePath = scope === 'group' && scopeId ? `/groups/${scopeId}/wolke` : '/documents/wolke';
  const response = await apiClient.post(`${basePath}/sync`, {
    shareLinkId,
    folderPath,
  });
  if (response.data?.success) {
    return response.data;
  }
  throw new Error(response.data?.message || 'Failed to start sync');
}

export async function setAutoSync(
  shareLinkId: string,
  folderPath: string = '',
  enabled: boolean,
  scope?: WolkeScope,
  scopeId?: string | null
): Promise<ConnectionTestResult> {
  const basePath = scope === 'group' && scopeId ? `/groups/${scopeId}/wolke` : '/documents/wolke';
  const response = await apiClient.post(`${basePath}/auto-sync`, {
    shareLinkId,
    folderPath,
    enabled,
  });
  if (response.data?.success) {
    return response.data;
  }
  throw new Error(response.data?.message || 'Failed to set auto-sync');
}

// ── Utility Functions ──────────────────────────────────────────────────

export function validateShareLink(url: string): ShareLinkValidationResult {
  if (!url || typeof url !== 'string') {
    return { isValid: false, error: 'Share link ist erforderlich' };
  }

  const parsed = parseShareLink(url);
  if (!parsed) {
    return { isValid: false, error: 'Ungültiges Nextcloud Share-Link Format' };
  }

  return {
    isValid: true,
    shareToken: parsed.shareToken,
    baseUrl: parsed.baseUrl,
    error: null,
  };
}

export function parseShareLink(url: string): ParsedShareLink | null {
  try {
    const urlObj = new URL(url);
    const pathMatch = urlObj.pathname.match(/\/s\/([A-Za-z0-9]+)/);
    if (!pathMatch) return null;

    return {
      baseUrl: `${urlObj.protocol}//${urlObj.host}`,
      shareToken: pathMatch[1],
      fullPath: urlObj.pathname + urlObj.search,
    };
  } catch {
    return null;
  }
}

export function generateDisplayName(
  shareLink: ShareLink,
  fallback = 'Unbenannte Verbindung'
): string {
  if (shareLink.label?.trim()) {
    return shareLink.label.trim();
  }

  if (shareLink.share_link) {
    const parsed = parseShareLink(shareLink.share_link);
    if (parsed) {
      return `${parsed.baseUrl.replace(/^https?:\/\//, '')} (${parsed.shareToken})`;
    }
  }

  return fallback;
}

export function generateDisplayUrl(shareLink: ShareLink): string {
  if (shareLink.share_link) {
    return shareLink.share_link.replace(/^https?:\/\//, '');
  }
  return 'Ungültige URL';
}

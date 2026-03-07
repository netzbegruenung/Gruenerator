import { apiClient } from './apiClient';

export interface ShareLink {
  id: string;
  share_link: string;
  label: string | null;
  base_url: string | null;
  share_token: string | null;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

interface ConnectionTestResult {
  success: boolean;
  message: string;
  writable?: boolean;
}

interface AddShareLinkResponse {
  success: boolean;
  shareLink: ShareLink;
  connectionTest: ConnectionTestResult;
}

const SHARE_LINK_PATTERN = /\/s\/[A-Za-z0-9]+/;

export function validateShareLink(url: string): { valid: boolean; error?: string } {
  if (!url.trim()) return { valid: false, error: 'Share-Link ist erforderlich.' };
  try {
    new URL(url);
  } catch {
    return { valid: false, error: 'Ungültiges URL-Format.' };
  }
  if (!SHARE_LINK_PATTERN.test(url)) {
    return {
      valid: false,
      error: 'Ungültiges Nextcloud Share-Link-Format. Der Link muss "/s/" enthalten.',
    };
  }
  return { valid: true };
}

export async function fetchShareLinks(): Promise<ShareLink[]> {
  const { data } = await apiClient.get<{ success: boolean; shareLinks: ShareLink[] }>(
    '/nextcloud/share-links'
  );
  return data.shareLinks;
}

export async function addShareLink(
  shareLink: string,
  label?: string
): Promise<AddShareLinkResponse> {
  const { data } = await apiClient.post<AddShareLinkResponse>('/nextcloud/share-links', {
    shareLink,
    ...(label?.trim() ? { label: label.trim() } : {}),
  });
  return data;
}

export async function deleteShareLink(id: string): Promise<void> {
  await apiClient.delete(`/nextcloud/share-links/${id}`);
}

export async function testConnection(shareLink: string): Promise<ConnectionTestResult> {
  const { data } = await apiClient.post<ConnectionTestResult>('/nextcloud/test-connection', {
    shareLink,
  });
  return data;
}

export interface WolkeFolderItem {
  name: string;
  href: string;
  isDirectory: boolean;
  size: number | null;
  lastModified: string | null;
}

export async function browseFolder(shareLinkId: string, path?: string): Promise<WolkeFolderItem[]> {
  const params = path ? `?path=${encodeURIComponent(path)}` : '';
  const { data } = await apiClient.get<{ success: boolean; items: WolkeFolderItem[] }>(
    `/nextcloud/share-links/${shareLinkId}/browse${params}`
  );
  return data.items;
}

export interface UploadResult {
  success: boolean;
  message: string;
  filename?: string;
  url?: string;
}

export async function uploadToWolke(
  shareLinkId: string,
  content: string,
  filename: string,
  folderPath?: string
): Promise<UploadResult> {
  const { data } = await apiClient.post<UploadResult>('/nextcloud/upload', {
    shareLinkId,
    content,
    filename,
    ...(folderPath ? { folderPath } : {}),
  });
  return data;
}

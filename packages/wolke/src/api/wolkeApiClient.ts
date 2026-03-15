import { getGlobalApiClient } from '@gruenerator/shared/api';

import {
  type ConnectionTestResult,
  type ShareLink,
  type SyncStatus,
  type WolkeFileItem,
  type WolkeScope,
} from '../types';

function getBasePath(scope?: WolkeScope, scopeId?: string | null): string {
  return scope === 'group' && scopeId ? `/groups/${scopeId}/wolke` : '/nextcloud';
}

export async function fetchShareLinks(
  scope?: WolkeScope,
  scopeId?: string | null
): Promise<ShareLink[]> {
  const apiClient = getGlobalApiClient();
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
  const apiClient = getGlobalApiClient();
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
  const apiClient = getGlobalApiClient();
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
  const apiClient = getGlobalApiClient();
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
  const apiClient = getGlobalApiClient();
  const response = await apiClient.post('/nextcloud/upload', {
    shareLinkId,
    content,
    filename,
    ...(folderPath && { folderPath }),
  });
  return response.data;
}

export async function browseFolder(shareLinkId: string, path?: string): Promise<WolkeFileItem[]> {
  const apiClient = getGlobalApiClient();
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
  const apiClient = getGlobalApiClient();
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
  const apiClient = getGlobalApiClient();
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
  const apiClient = getGlobalApiClient();
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

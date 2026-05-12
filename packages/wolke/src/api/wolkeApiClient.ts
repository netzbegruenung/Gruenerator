import { getGlobalApiClient } from '@gruenerator/shared/api';

import {
  type ConnectionTestResult,
  type LinkGroupShare,
  type SharedWithMeLink,
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

export interface UploadToWolkeOptions {
  folderPath?: string;
  documentId?: string;
  enableLiveSync?: boolean;
}

export async function uploadToWolke(
  shareLinkId: string,
  content: string,
  filename: string,
  folderPathOrOptions?: string | UploadToWolkeOptions
): Promise<ConnectionTestResult> {
  const apiClient = getGlobalApiClient();
  const opts: UploadToWolkeOptions =
    typeof folderPathOrOptions === 'string'
      ? { folderPath: folderPathOrOptions }
      : (folderPathOrOptions ?? {});
  const response = await apiClient.post('/nextcloud/upload', {
    shareLinkId,
    content,
    filename,
    ...(opts.folderPath && { folderPath: opts.folderPath }),
    ...(opts.documentId && { documentId: opts.documentId }),
    ...(opts.enableLiveSync !== undefined && { enableLiveSync: opts.enableLiveSync }),
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

// ── Group sharing ──────────────────────────────────────────────────────

const CONTENT_TYPE_WOLKE = 'nextcloud_share_link' as const;

interface SharedWithMeResponse {
  success: boolean;
  message?: string;
  sharedWithMe?: SharedWithMeLink[];
}

interface LinkGroupSharesResponse {
  success: boolean;
  message?: string;
  groups?: LinkGroupShare[];
}

interface GroupShareMutationResponse {
  success: boolean;
  message?: string;
}

export async function fetchSharedWithMe(): Promise<SharedWithMeLink[]> {
  const apiClient = getGlobalApiClient();
  const response = await apiClient.get<SharedWithMeResponse>(
    '/nextcloud/share-links/shared-with-me'
  );
  if (response.data?.success) {
    return response.data.sharedWithMe ?? [];
  }
  throw new Error(response.data?.message ?? 'Failed to fetch shared Wolke links');
}

export async function fetchLinkGroupShares(shareLinkId: string): Promise<LinkGroupShare[]> {
  const apiClient = getGlobalApiClient();
  const response = await apiClient.get<LinkGroupSharesResponse>(
    `/nextcloud/share-links/${shareLinkId}/groups`
  );
  if (response.data?.success) {
    return response.data.groups ?? [];
  }
  throw new Error(response.data?.message ?? 'Failed to fetch groups for share link');
}

export async function shareLinkWithGroup(shareLinkId: string, groupId: string): Promise<void> {
  const apiClient = getGlobalApiClient();
  const response = await apiClient.post<GroupShareMutationResponse>(
    `/auth/groups/${groupId}/share`,
    {
      contentType: CONTENT_TYPE_WOLKE,
      contentId: shareLinkId,
      permissions: { read: true },
    }
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message ?? 'Failed to share Wolke link');
  }
}

export async function unshareLinkFromGroup(shareLinkId: string, groupId: string): Promise<void> {
  const apiClient = getGlobalApiClient();
  const response = await apiClient.delete<GroupShareMutationResponse>(
    `/auth/groups/${groupId}/share`,
    {
      data: {
        contentType: CONTENT_TYPE_WOLKE,
        contentId: shareLinkId,
      },
    }
  );
  if (!response.data?.success) {
    throw new Error(response.data?.message ?? 'Failed to unshare Wolke link');
  }
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

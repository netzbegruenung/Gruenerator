import { getGlobalApiClient } from '@gruenerator/shared/api';

import {
  type ConnectionTestResult,
  type LinkGroupShare,
  type SharedWithMeLink,
  type ShareLink,
  type WolkeFileItem,
} from '../types';

export async function fetchShareLinks(): Promise<ShareLink[]> {
  const apiClient = getGlobalApiClient();
  const response = await apiClient.get('/nextcloud/share-links');
  if (response.data?.success) {
    return response.data.shareLinks || [];
  }
  throw new Error('Failed to fetch share links');
}

export async function addShareLink(url: string, label?: string): Promise<ShareLink> {
  const apiClient = getGlobalApiClient();
  const response = await apiClient.post('/nextcloud/share-links', {
    shareLink: url.trim(),
    label: (label || '').trim(),
  });
  if (response.data?.success && response.data.shareLink) {
    return response.data.shareLink;
  }
  throw new Error(response.data?.message || 'Failed to add share link');
}

export async function deleteShareLink(id: string): Promise<void> {
  const apiClient = getGlobalApiClient();
  const response = await apiClient.delete(`/nextcloud/share-links/${id}`);
  if (!response.data?.success) {
    throw new Error(response.data?.message || 'Failed to delete share link');
  }
}

export async function testConnection(shareLink: string): Promise<ConnectionTestResult> {
  const apiClient = getGlobalApiClient();
  const response = await apiClient.post('/nextcloud/test-connection', {
    shareLink: shareLink.trim(),
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

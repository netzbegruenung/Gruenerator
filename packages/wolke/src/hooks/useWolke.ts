import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  addShareLink,
  browseFolder,
  deleteShareLink,
  fetchLinkGroupShares,
  fetchShareLinks,
  fetchSharedWithMe,
  shareLinkWithGroup,
  testConnection,
  unshareLinkFromGroup,
} from '../api/wolkeApiClient';
import { type LinkGroupShare, type SharedWithMeLink } from '../types';

export const wolkeKeys = {
  all: ['wolke'] as const,
  shareLinks: () => ['wolke', 'share-links'] as const,
  files: (shareLinkId: string) => ['wolke', 'files', shareLinkId] as const,
  browse: (shareLinkId: string, path: string) => ['wolke', 'browse', shareLinkId, path] as const,
  sharedWithMe: () => ['wolke', 'share-links', 'shared-with-me'] as const,
  linkGroupShares: (shareLinkId: string) =>
    ['wolke', 'share-links', shareLinkId, 'groups'] as const,
};

export function useShareLinks(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: wolkeKeys.shareLinks(),
    queryFn: () => fetchShareLinks(),
    staleTime: 30_000,
    enabled: options?.enabled,
  });
}

export function useWolkeFiles(shareLinkId: string | null) {
  return useQuery({
    queryKey: wolkeKeys.files(shareLinkId!),
    queryFn: () => browseFolder(shareLinkId!),
    staleTime: 3 * 60 * 1000,
    enabled: !!shareLinkId,
  });
}

export function useWolkeBrowse(shareLinkId: string | null, path: string) {
  return useQuery({
    queryKey: wolkeKeys.browse(shareLinkId!, path),
    queryFn: () => browseFolder(shareLinkId!, path || undefined),
    staleTime: 60_000,
    enabled: !!shareLinkId,
  });
}

export function useAddShareLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ url, label }: { url: string; label?: string }) => addShareLink(url, label),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: wolkeKeys.shareLinks(),
      });
    },
  });
}

export function useDeleteShareLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteShareLink(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: wolkeKeys.shareLinks(),
      });
    },
  });
}

export function useTestConnection() {
  return useMutation({
    mutationFn: (shareLinkUrl: string) => testConnection(shareLinkUrl),
  });
}

// ── Group sharing ──────────────────────────────────────────────────────

export function useSharedWithMeLinks(options?: { enabled?: boolean }) {
  return useQuery<SharedWithMeLink[]>({
    queryKey: wolkeKeys.sharedWithMe(),
    queryFn: () => fetchSharedWithMe(),
    staleTime: 30_000,
    enabled: options?.enabled,
  });
}

export function useLinkGroupShares(shareLinkId: string | null, options?: { enabled?: boolean }) {
  return useQuery<LinkGroupShare[]>({
    queryKey: wolkeKeys.linkGroupShares(shareLinkId ?? ''),
    queryFn: () => fetchLinkGroupShares(shareLinkId!),
    enabled: !!shareLinkId && options?.enabled !== false,
    staleTime: 30_000,
  });
}

export function useShareLinkWithGroup(shareLinkId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => shareLinkWithGroup(shareLinkId, groupId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: wolkeKeys.linkGroupShares(shareLinkId),
      });
    },
  });
}

export function useUnshareLinkFromGroup(shareLinkId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => unshareLinkFromGroup(shareLinkId, groupId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: wolkeKeys.linkGroupShares(shareLinkId),
      });
    },
  });
}

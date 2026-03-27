import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  addShareLink,
  browseFolder,
  deleteShareLink,
  fetchShareLinks,
  fetchSyncStatuses,
  setAutoSync,
  syncFolder,
  testConnection,
  uploadToWolke,
} from '../api/wolkeApiClient';
import { type WolkeScope } from '../types';

export const wolkeKeys = {
  all: ['wolke'] as const,
  shareLinks: (scope?: WolkeScope, scopeId?: string | null) =>
    ['wolke', 'share-links', scope ?? 'personal', scopeId ?? null] as const,
  syncStatuses: (scope?: WolkeScope, scopeId?: string | null) =>
    ['wolke', 'sync-statuses', scope ?? 'personal', scopeId ?? null] as const,
  files: (shareLinkId: string) => ['wolke', 'files', shareLinkId] as const,
  browse: (shareLinkId: string, path: string) => ['wolke', 'browse', shareLinkId, path] as const,
};

export function useShareLinks(
  scope?: WolkeScope,
  scopeId?: string | null,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: wolkeKeys.shareLinks(scope, scopeId),
    queryFn: () => fetchShareLinks(scope, scopeId),
    staleTime: 30_000,
    enabled: options?.enabled,
  });
}

export function useSyncStatuses(scope?: WolkeScope, scopeId?: string | null) {
  return useQuery({
    queryKey: wolkeKeys.syncStatuses(scope, scopeId),
    queryFn: () => fetchSyncStatuses(scope, scopeId),
    staleTime: 10_000,
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

export function useAddShareLink(scope?: WolkeScope, scopeId?: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ url, label }: { url: string; label?: string }) =>
      addShareLink(url, label, scope, scopeId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: wolkeKeys.shareLinks(scope, scopeId),
      });
    },
  });
}

export function useDeleteShareLink(scope?: WolkeScope, scopeId?: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteShareLink(id, scope, scopeId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: wolkeKeys.shareLinks(scope, scopeId),
      });
    },
  });
}

export function useTestConnection(scope?: WolkeScope, scopeId?: string | null) {
  return useMutation({
    mutationFn: (shareLinkUrl: string) => testConnection(shareLinkUrl, scope, scopeId),
  });
}

export function useUploadToWolke() {
  return useMutation({
    mutationFn: ({
      shareLinkId,
      content,
      filename,
      folderPath,
    }: {
      shareLinkId: string;
      content: string;
      filename: string;
      folderPath?: string;
    }) => uploadToWolke(shareLinkId, content, filename, folderPath),
  });
}

export function useSyncFolder(scope?: WolkeScope, scopeId?: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ shareLinkId, folderPath }: { shareLinkId: string; folderPath?: string }) =>
      syncFolder(shareLinkId, folderPath, scope, scopeId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: wolkeKeys.syncStatuses(scope, scopeId),
      });
    },
  });
}

export function useSetAutoSync(scope?: WolkeScope, scopeId?: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      shareLinkId,
      folderPath,
      enabled,
    }: {
      shareLinkId: string;
      folderPath?: string;
      enabled: boolean;
    }) => setAutoSync(shareLinkId, folderPath, enabled, scope, scopeId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: wolkeKeys.syncStatuses(scope, scopeId),
      });
    },
  });
}

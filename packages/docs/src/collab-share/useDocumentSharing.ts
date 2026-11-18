import { useQuery, useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';

import {
  type CollabShareApiClient,
  type ShareMode,
  type SharingCollaborator,
  type SharingGroupShare,
  type SharingShareSettings,
  type SharingUserGroup,
} from './types.js';

interface UseDocumentSharingOptions {
  /** Cache-key namespace, e.g. 'docs', 'canvas'. Used to scope React-Query keys. */
  namespace: string;
  /** Request client — platform-specific (docs adapter client, axios wrapper, …). */
  apiClient: CollabShareApiClient;
  /** Additional QueryKeys to invalidate alongside the standard three (boards needs assignable-members). */
  extraInvalidationKeys?: QueryKey[];
}

/**
 * Shared hook for managing collaborative-document sharing UI. Docs, boards,
 * canvas and sheets all live in the same `collaborative_documents` table and
 * use the same `/api/docs/:id/...` endpoints; only the React-Query cache
 * prefix and the request client differ per consumer.
 */
export const useDocumentSharing = (
  documentId: string,
  { namespace, apiClient, extraInvalidationKeys = [] }: UseDocumentSharingOptions
) => {
  const queryClient = useQueryClient();
  const permKey = [namespace, documentId, 'permissions'];
  const shareKey = [namespace, documentId, 'share'];
  const groupsKey = [namespace, documentId, 'groups'];

  const collaborators = useQuery<SharingCollaborator[]>({
    queryKey: permKey,
    queryFn: () => apiClient.get<SharingCollaborator[]>(`/docs/${documentId}/permissions`),
    enabled: !!documentId,
  });

  const shareSettings = useQuery<SharingShareSettings>({
    queryKey: shareKey,
    queryFn: () => apiClient.get<SharingShareSettings>(`/docs/${documentId}/share`),
    enabled: !!documentId,
  });

  const userGroups = useQuery<SharingUserGroup[]>({
    queryKey: ['docs', 'groups', 'me'],
    queryFn: () => apiClient.get<SharingUserGroup[]>('/docs/groups/me'),
  });

  const documentGroups = useQuery<SharingGroupShare[]>({
    queryKey: groupsKey,
    queryFn: () => apiClient.get<SharingGroupShare[]>(`/docs/${documentId}/groups`),
    enabled: !!documentId,
  });

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: permKey });
    void queryClient.invalidateQueries({ queryKey: shareKey });
    void queryClient.invalidateQueries({ queryKey: groupsKey });
    for (const k of extraInvalidationKeys) {
      void queryClient.invalidateQueries({ queryKey: k });
    }
  };

  /**
   * The share controls are controlled <select>s bound to the cached server
   * rows. Without writing the cache first, a new choice snaps back to the old
   * value until the refetch lands — it reads as "the select won't take my
   * choice". Write optimistically, roll back on error, refetch either way.
   */
  const optimistic = <TCache, TVars>(
    key: QueryKey,
    patch: (old: TCache, vars: TVars) => TCache
  ) => ({
    onMutate: async (vars: TVars) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TCache>(key);
      if (previous) queryClient.setQueryData<TCache>(key, patch(previous, vars));
      return { previous };
    },
    onError: (_err: Error, _vars: TVars, ctx?: { previous?: TCache }) => {
      if (ctx?.previous) queryClient.setQueryData<TCache>(key, ctx.previous);
    },
    onSettled: invalidateAll,
  });

  const setShareMode = useMutation({
    mutationFn: async (mode: ShareMode) => {
      await apiClient.put(`/docs/${documentId}/share/mode`, { mode });
    },
    ...optimistic<SharingShareSettings, ShareMode>(shareKey, (old, mode) => ({
      ...old,
      share_mode: mode,
      is_public: mode === 'public',
    })),
  });

  const setSharePermission = useMutation({
    mutationFn: async (permission: 'viewer' | 'editor') => {
      await apiClient.put(`/docs/${documentId}/share/permission`, { permission });
    },
    ...optimistic<SharingShareSettings, 'viewer' | 'editor'>(shareKey, (old, permission) => ({
      ...old,
      share_permission: permission,
    })),
  });

  const grantAccess = useMutation({
    mutationFn: async ({
      userId,
      permissionLevel,
    }: {
      userId: string;
      permissionLevel: string;
    }) => {
      await apiClient.post(`/docs/${documentId}/permissions`, {
        user_id: userId,
        permission_level: permissionLevel,
      });
    },
    onSuccess: invalidateAll,
  });

  const updatePermission = useMutation({
    mutationFn: async ({
      userId,
      permissionLevel,
    }: {
      userId: string;
      permissionLevel: 'viewer' | 'editor';
    }) => {
      await apiClient.put(`/docs/${documentId}/permissions/${userId}`, {
        permission_level: permissionLevel,
      });
    },
    ...optimistic<SharingCollaborator[], { userId: string; permissionLevel: 'viewer' | 'editor' }>(
      permKey,
      (old, { userId, permissionLevel }) =>
        old.map((c) => (c.user_id === userId ? { ...c, permission_level: permissionLevel } : c))
    ),
  });

  const revokeAccess = useMutation({
    mutationFn: async (userId: string) => {
      await apiClient.delete(`/docs/${documentId}/permissions/${userId}`);
    },
    onSuccess: invalidateAll,
  });

  const shareWithGroup = useMutation({
    mutationFn: async ({
      groupId,
      permissionLevel,
    }: {
      groupId: string;
      permissionLevel: string;
    }) => {
      await apiClient.post(`/docs/${documentId}/groups`, {
        group_id: groupId,
        permission_level: permissionLevel,
      });
    },
    onSuccess: invalidateAll,
  });

  const updateGroupPermission = useMutation({
    mutationFn: async ({
      groupId,
      permissionLevel,
    }: {
      groupId: string;
      permissionLevel: 'viewer' | 'editor';
    }) => {
      await apiClient.put(`/docs/${documentId}/groups/${groupId}`, {
        permission_level: permissionLevel,
      });
    },
    ...optimistic<SharingGroupShare[], { groupId: string; permissionLevel: 'viewer' | 'editor' }>(
      groupsKey,
      (old, { groupId, permissionLevel }) =>
        old.map((g) => (g.group_id === groupId ? { ...g, permission_level: permissionLevel } : g))
    ),
  });

  const unshareFromGroup = useMutation({
    mutationFn: async (groupId: string) => {
      await apiClient.delete(`/docs/${documentId}/groups/${groupId}`);
    },
    onSuccess: invalidateAll,
  });

  return {
    collaborators: collaborators.data ?? [],
    shareSettings: shareSettings.data ?? null,
    userGroups: userGroups.data ?? [],
    documentGroups: documentGroups.data ?? [],
    isLoading: collaborators.isLoading || shareSettings.isLoading,
    setShareMode,
    setSharePermission,
    grantAccess,
    updatePermission,
    revokeAccess,
    shareWithGroup,
    updateGroupPermission,
    unshareFromGroup,
  };
};

export type DocumentSharing = ReturnType<typeof useDocumentSharing>;

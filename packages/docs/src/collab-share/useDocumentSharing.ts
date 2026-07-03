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

  const setShareMode = useMutation({
    mutationFn: async (mode: ShareMode) => {
      await apiClient.put(`/docs/${documentId}/share/mode`, { mode });
    },
    onSuccess: invalidateAll,
  });

  const setSharePermission = useMutation({
    mutationFn: async (permission: 'viewer' | 'editor') => {
      await apiClient.put(`/docs/${documentId}/share/permission`, { permission });
    },
    onSuccess: invalidateAll,
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
      permissionLevel: string;
    }) => {
      await apiClient.put(`/docs/${documentId}/permissions/${userId}`, {
        permission_level: permissionLevel,
      });
    },
    onSuccess: invalidateAll,
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
      permissionLevel: string;
    }) => {
      await apiClient.put(`/docs/${documentId}/groups/${groupId}`, {
        permission_level: permissionLevel,
      });
    },
    onSuccess: invalidateAll,
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

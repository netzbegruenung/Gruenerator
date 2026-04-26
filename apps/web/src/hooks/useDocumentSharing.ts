import { useQuery, useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';

import apiClient from '../components/utils/apiClient';

export interface SharingCollaborator {
  user_id: string;
  display_name: string;
  email: string;
  avatar_url?: string;
  avatar_robot_id?: number;
  permission_level: 'owner' | 'editor' | 'viewer';
  granted_at: string;
}

export interface SharingShareSettings {
  is_public: boolean;
  share_permission: 'viewer' | 'editor';
  share_mode: 'private' | 'authenticated' | 'public';
}

export interface SharingUserGroup {
  id: string;
  name: string;
  role: string;
}

export interface SharingGroupShare {
  group_id: string;
  group_name: string;
  permission_level: 'viewer' | 'editor';
  shared_at: string;
}

interface UseDocumentSharingOptions {
  /** Cache-key namespace, e.g. 'docs', 'canvas'. Used to scope React-Query keys. */
  namespace: string;
  /** Additional QueryKeys to invalidate alongside the standard three (boards needs assignable-members). */
  extraInvalidationKeys?: QueryKey[];
}

/**
 * Shared hook for managing collaborative-document sharing UI. Both boards and
 * canvas documents live in the same `collaborative_documents` table and use
 * the same `/api/docs/:id/...` endpoints; only the React-Query cache prefix
 * differs.
 */
export const useDocumentSharing = (
  documentId: string,
  { namespace, extraInvalidationKeys = [] }: UseDocumentSharingOptions
) => {
  const queryClient = useQueryClient();
  const permKey = [namespace, documentId, 'permissions'];
  const shareKey = [namespace, documentId, 'share'];
  const groupsKey = [namespace, documentId, 'groups'];

  const collaborators = useQuery<SharingCollaborator[]>({
    queryKey: permKey,
    queryFn: async () => {
      const res = await apiClient.get<SharingCollaborator[]>(`/docs/${documentId}/permissions`);
      return res.data;
    },
    enabled: !!documentId,
  });

  const shareSettings = useQuery<SharingShareSettings>({
    queryKey: shareKey,
    queryFn: async () => {
      const res = await apiClient.get<SharingShareSettings>(`/docs/${documentId}/share`);
      return res.data;
    },
    enabled: !!documentId,
  });

  const userGroups = useQuery<SharingUserGroup[]>({
    queryKey: ['docs', 'groups', 'me'],
    queryFn: async () => {
      const res = await apiClient.get<SharingUserGroup[]>('/docs/groups/me');
      return res.data;
    },
  });

  const documentGroups = useQuery<SharingGroupShare[]>({
    queryKey: groupsKey,
    queryFn: async () => {
      const res = await apiClient.get<SharingGroupShare[]>(`/docs/${documentId}/groups`);
      return res.data;
    },
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
    mutationFn: async (mode: 'private' | 'authenticated' | 'public') => {
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
    unshareFromGroup,
  };
};

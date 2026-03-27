import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import apiClient from '../../../components/utils/apiClient';

interface Collaborator {
  user_id: string;
  display_name: string;
  email: string;
  avatar_url?: string;
  avatar_robot_id?: number;
  permission_level: 'owner' | 'editor' | 'viewer';
  granted_at: string;
}

interface ShareSettings {
  is_public: boolean;
  share_permission: 'viewer' | 'editor';
  share_mode: 'private' | 'authenticated' | 'public';
}

interface UserGroup {
  id: string;
  name: string;
  role: string;
}

interface GroupShare {
  group_id: string;
  group_name: string;
  permission_level: 'viewer' | 'editor';
  shared_at: string;
}

export const useBoardSharing = (boardId: string) => {
  const queryClient = useQueryClient();
  const permKey = ['docs', boardId, 'permissions'];
  const shareKey = ['docs', boardId, 'share'];
  const groupsKey = ['docs', boardId, 'groups'];

  const collaborators = useQuery<Collaborator[]>({
    queryKey: permKey,
    queryFn: async () => {
      const res = await apiClient.get(`/docs/${boardId}/permissions`);
      return res.data;
    },
    enabled: !!boardId,
  });

  const shareSettings = useQuery<ShareSettings>({
    queryKey: shareKey,
    queryFn: async () => {
      const res = await apiClient.get(`/docs/${boardId}/share`);
      return res.data;
    },
    enabled: !!boardId,
  });

  const userGroups = useQuery<UserGroup[]>({
    queryKey: ['docs', 'user-groups'],
    queryFn: async () => {
      const res = await apiClient.get('/docs/user-groups');
      return res.data;
    },
  });

  const boardGroups = useQuery<GroupShare[]>({
    queryKey: groupsKey,
    queryFn: async () => {
      const res = await apiClient.get(`/docs/${boardId}/groups`);
      return res.data;
    },
    enabled: !!boardId,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: permKey });
    queryClient.invalidateQueries({ queryKey: shareKey });
    queryClient.invalidateQueries({ queryKey: groupsKey });
  };

  const setShareMode = useMutation({
    mutationFn: async (mode: 'private' | 'authenticated' | 'public') => {
      await apiClient.put(`/docs/${boardId}/share/mode`, { mode });
    },
    onSuccess: invalidateAll,
  });

  const setSharePermission = useMutation({
    mutationFn: async (permission: 'viewer' | 'editor') => {
      await apiClient.put(`/docs/${boardId}/share/permission`, { permission });
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
      await apiClient.post(`/docs/${boardId}/permissions`, {
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
      await apiClient.put(`/docs/${boardId}/permissions/${userId}`, {
        permission_level: permissionLevel,
      });
    },
    onSuccess: invalidateAll,
  });

  const revokeAccess = useMutation({
    mutationFn: async (userId: string) => {
      await apiClient.delete(`/docs/${boardId}/permissions/${userId}`);
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
      await apiClient.post(`/docs/${boardId}/groups`, {
        group_id: groupId,
        permission_level: permissionLevel,
      });
    },
    onSuccess: invalidateAll,
  });

  const unshareFromGroup = useMutation({
    mutationFn: async (groupId: string) => {
      await apiClient.delete(`/docs/${boardId}/groups/${groupId}`);
    },
    onSuccess: invalidateAll,
  });

  return {
    collaborators: collaborators.data ?? [],
    shareSettings: shareSettings.data ?? null,
    userGroups: userGroups.data ?? [],
    boardGroups: boardGroups.data ?? [],
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

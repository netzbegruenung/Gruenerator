import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';

import apiClient from '../../../components/utils/apiClient';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { useGroupsStore } from '../../../stores/auth/groupsStore';

export interface GroupSummary {
  id: string;
  name: string;
  description?: string;
  avatar_url?: string | null;
  member_count?: number;
  role?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface GroupMember {
  id: string;
  user_id: string;
  display_name?: string;
  first_name?: string;
  email?: string;
  role?: string;
  avatar_robot_id?: number;
  [key: string]: unknown;
}

interface MutationOptions<T = unknown> {
  onSuccess?: (result: T) => void;
  onError?: (error: Error) => void;
}

interface UseGroupsOptions {
  isActive?: boolean;
}

export const useGroups = ({ isActive }: UseGroupsOptions = {}) => {
  const { user, isAuthenticated, loading: authLoading } = useOptimizedAuth();
  const queryClient = useQueryClient();

  const {
    isSaving,
    setSaving,
    isDeleting,
    setDeleting,
    deletingGroupId,
    setDeletingGroupId,
    isCreating,
    setCreating,
    isJoining,
    setJoining,
    clearMessages,
  } = useGroupsStore();

  const groupsQueryKey = ['userGroups', user?.id];

  const fetchGroupsFn = async (): Promise<GroupSummary[]> => {
    if (!user?.id) throw new Error('User not authenticated');
    const response = await apiClient.get('/auth/groups', { skipAuthRedirect: true });
    return response.data.groups || [];
  };

  const query = useQuery({
    queryKey: groupsQueryKey,
    queryFn: fetchGroupsFn,
    enabled: !!user?.id && isAuthenticated && !authLoading && isActive,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: 'always' as const,
    refetchOnReconnect: true,
    retry: (failureCount: number) => failureCount < 2,
    refetchInterval: false,
  });

  const createGroupMutation = useMutation({
    mutationFn: async (groupName: string) => {
      if (!user?.id) throw new Error('User not authenticated');
      const response = await apiClient.post('/auth/groups', { name: groupName });
      return response.data.group as GroupSummary;
    },
    onMutate: () => {
      setCreating(true);
      clearMessages();
    },
    onSuccess: (newGroup) => {
      setCreating(false);
      queryClient.invalidateQueries({ queryKey: groupsQueryKey });
      queryClient.removeQueries({ queryKey: ['groupDetails', newGroup.id] });
    },
    onError: () => {
      setCreating(false);
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      if (!user?.id) throw new Error('User not authenticated');
      await apiClient.delete(`/auth/groups/${groupId}`);
      return groupId;
    },
    onMutate: (groupId) => {
      setDeleting(true);
      setDeletingGroupId(groupId);
      clearMessages();
    },
    onSuccess: () => {
      setDeleting(false);
      setDeletingGroupId(null);
      queryClient.invalidateQueries({ queryKey: groupsQueryKey });
    },
    onError: () => {
      setDeleting(false);
      setDeletingGroupId(null);
    },
  });

  const updateGroupInfoMutation = useMutation({
    mutationFn: async ({
      groupId,
      name,
      description,
    }: {
      groupId: string;
      name: string;
      description?: string;
    }) => {
      if (!user?.id) throw new Error('User not authenticated');
      const response = await apiClient.put(`/auth/groups/${groupId}/info`, { name, description });
      return response.data;
    },
    onMutate: () => {
      setSaving(true);
      clearMessages();
    },
    onSuccess: () => {
      setSaving(false);
      queryClient.invalidateQueries({ queryKey: groupsQueryKey });
      queryClient.invalidateQueries({ queryKey: ['groupDetails'] });
    },
    onError: () => {
      setSaving(false);
    },
  });

  const updateGroupNameMutation = useMutation({
    mutationFn: async ({ groupId, name }: { groupId: string; name: string }) => {
      if (!user?.id) throw new Error('User not authenticated');
      const response = await apiClient.put(`/auth/groups/${groupId}/name`, { name });
      return response.data;
    },
    onMutate: () => {
      setSaving(true);
      clearMessages();
    },
    onSuccess: () => {
      setSaving(false);
      queryClient.invalidateQueries({ queryKey: groupsQueryKey });
      queryClient.invalidateQueries({ queryKey: ['groupDetails'] });
    },
    onError: () => {
      setSaving(false);
    },
  });

  const joinGroupMutation = useMutation({
    mutationFn: async (joinToken: string) => {
      if (!user?.id) throw new Error('User not authenticated');
      const response = await apiClient.post('/auth/groups/join', { joinToken });
      return response.data;
    },
    onMutate: () => {
      setJoining(true);
      clearMessages();
    },
    onSuccess: () => {
      setJoining(false);
      queryClient.invalidateQueries({ queryKey: groupsQueryKey });
    },
    onError: () => {
      setJoining(false);
    },
  });

  const createGroup = (groupName: string, options: MutationOptions<GroupSummary> = {}) => {
    createGroupMutation.mutate(groupName, {
      onSuccess: (newGroup) => options.onSuccess?.(newGroup),
      onError: (error) => options.onError?.(error),
    });
  };

  const deleteGroup = (groupId: string, options: MutationOptions<string> = {}) => {
    deleteGroupMutation.mutate(groupId, {
      onSuccess: (deletedGroupId) => options.onSuccess?.(deletedGroupId),
      onError: (error) => options.onError?.(error),
    });
  };

  const updateGroupInfo = (
    groupId: string,
    { name, description }: { name: string; description?: string },
    options: MutationOptions = {}
  ) => {
    updateGroupInfoMutation.mutate(
      { groupId, name, description },
      {
        onSuccess: (result) => options.onSuccess?.(result),
        onError: (error) => options.onError?.(error),
      }
    );
  };

  const updateGroupName = (groupId: string, name: string, options: MutationOptions = {}) => {
    updateGroupNameMutation.mutate(
      { groupId, name },
      {
        onSuccess: (result) => options.onSuccess?.(result),
        onError: (error) => options.onError?.(error),
      }
    );
  };

  const joinGroup = (joinToken: string, options: MutationOptions = {}) => {
    joinGroupMutation.mutate(joinToken, {
      onSuccess: (result) => options.onSuccess?.(result),
      onError: (error) => options.onError?.(error),
    });
  };

  return {
    userGroups: query.data || ([] as GroupSummary[]),
    isLoadingGroups: query.isPending,
    isFetchingGroups: query.isFetching,
    isErrorGroups: query.isError,
    errorGroups: query.error,
    refetchGroups: query.refetch,

    createGroup,
    isCreatingGroup: isCreating,
    isCreateGroupError: createGroupMutation.isError,
    createGroupError: createGroupMutation.error,
    isCreateGroupSuccess: createGroupMutation.isSuccess,

    deleteGroup,
    isDeletingGroup: isDeleting,
    deletingGroupId,
    isDeleteGroupError: deleteGroupMutation.isError,
    deleteGroupError: deleteGroupMutation.error,
    isDeleteGroupSuccess: deleteGroupMutation.isSuccess,

    updateGroupInfo,
    updateGroupName,
    isUpdatingGroupName: isSaving,
    isUpdateGroupNameError: updateGroupNameMutation.isError,
    updateGroupNameError: updateGroupNameMutation.error,
    isUpdateGroupNameSuccess: updateGroupNameMutation.isSuccess,
    isUpdatingGroupInfo: updateGroupInfoMutation.isPending,
    isUpdateGroupInfoError: updateGroupInfoMutation.isError,
    updateGroupInfoError: updateGroupInfoMutation.error,
    isUpdateGroupInfoSuccess: updateGroupInfoMutation.isSuccess,

    joinGroup,
    isJoiningGroup: isJoining,
    isJoinGroupError: joinGroupMutation.isError,
    joinGroupError: joinGroupMutation.error,
    isJoinGroupSuccess: joinGroupMutation.isSuccess,

    isSaving,
    clearMessages,
  };
};

export const useGroupMembers = (groupId: string | null, _options: UseGroupsOptions = {}) => {
  const { user, isAuthenticated, loading: authLoading } = useOptimizedAuth();

  const membersQueryKey = ['groupMembers', groupId];

  const fetchMembersFn = async (): Promise<GroupMember[]> => {
    if (!user?.id || !groupId) throw new Error('User not authenticated or group ID missing');
    const response = await apiClient.get(`/auth/groups/${groupId}/members`);
    return response.data.members || [];
  };

  const query = useQuery({
    queryKey: membersQueryKey,
    queryFn: fetchMembersFn,
    enabled: !!user?.id && !!groupId && isAuthenticated && !authLoading,
    staleTime: 20 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: true,
    retry: (failureCount: number) => failureCount < 2,
    refetchInterval: false,
  });

  return {
    members: query.data || [],
    isLoadingMembers: query.isPending,
    isFetchingMembers: query.isFetching,
    isErrorMembers: query.isError,
    errorMembers: query.error,
    refetchMembers: query.refetch,
  };
};

export const useUpdateMemberRole = (groupId: string) => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: 'admin' | 'member' }) => {
      const response = await apiClient.put(`/auth/groups/${groupId}/members/${memberId}/role`, {
        role,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groupMembers', groupId] });
    },
  });

  return {
    updateMemberRole: mutation.mutate,
    isUpdatingRole: mutation.isPending,
  };
};

interface GroupContentData {
  [key: string]: any[];
}

export const useGroupSharing = (groupId: string | null, _options: UseGroupsOptions = {}) => {
  const { user, isAuthenticated, loading: authLoading } = useOptimizedAuth();
  const queryClient = useQueryClient();

  const groupContentQueryKey = ['groupContent', groupId];

  const fetchGroupContentFn = async (): Promise<GroupContentData> => {
    if (!user?.id || !groupId) {
      throw new Error('User not authenticated or group ID missing');
    }
    const response = await apiClient.get(`/auth/groups/${groupId}/content`);
    return response.data.content || {};
  };

  const queryEnabled = !!user?.id && !!groupId && isAuthenticated && !authLoading;

  const groupContentQuery = useQuery({
    queryKey: groupContentQueryKey,
    queryFn: fetchGroupContentFn,
    enabled: queryEnabled,
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: 'always' as const,
    refetchOnReconnect: true,
    retry: (failureCount: number) => failureCount < 2,
    refetchInterval: false,
  });

  const unshareContentMutation = useMutation({
    mutationFn: async ({ contentId, contentType }: { contentId: string; contentType: string }) => {
      await apiClient.delete(`/auth/groups/${groupId}/content/${contentId}`, {
        data: { contentType },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groupContentQueryKey });
    },
  });

  return {
    groupContent: groupContentQuery.data || {},
    isLoadingGroupContent: groupContentQuery.isPending,
    isFetchingGroupContent: groupContentQuery.isFetching,
    isErrorGroupContent: groupContentQuery.isError,
    errorGroupContent: groupContentQuery.error,
    refetchGroupContent: async () => {
      if (!user?.id || !groupId) return;
      return groupContentQuery.refetch();
    },
    unshareContent: unshareContentMutation,
  };
};

interface VorlagenData {
  vorlagen?: unknown[];
  tags?: string[];
}

export const useGroupVorlagen = (groupId: string | null, { isActive }: UseGroupsOptions = {}) => {
  const { user, isAuthenticated, loading: authLoading } = useOptimizedAuth();

  const vorlagenQueryKey = ['groupVorlagen', groupId];

  const fetchVorlagenFn = async (): Promise<VorlagenData> => {
    if (!user?.id || !groupId) {
      throw new Error('User not authenticated or group ID missing');
    }

    const response = await apiClient.get(`/auth/groups/${groupId}/vorlagen`);
    return response.data;
  };

  const query = useQuery({
    queryKey: vorlagenQueryKey,
    queryFn: fetchVorlagenFn,
    enabled: !!user?.id && !!groupId && isAuthenticated && !authLoading && isActive,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: 'always' as const,
    retry: (failureCount: number) => failureCount < 2,
  });

  return {
    vorlagen: query.data?.vorlagen || [],
    tags: query.data?.tags || [],
    isLoadingVorlagen: query.isPending,
    isFetchingVorlagen: query.isFetching,
    refetchVorlagen: query.refetch,
  };
};

export const useUpdateGroupSettings = (groupId: string | null) => {
  const { user } = useOptimizedAuth();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (settings: Record<string, unknown>) => {
      if (!user?.id || !groupId) {
        throw new Error('User not authenticated or group ID missing');
      }

      const response = await apiClient.put(`/auth/groups/${groupId}/info`, { settings });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groupDetails'] });
      queryClient.invalidateQueries({ queryKey: ['groupVorlagen', groupId] });
    },
  });

  return {
    updateSettings: (settings: Record<string, unknown>, options: MutationOptions = {}) => {
      mutation.mutate(settings, {
        onSuccess: (result) => options.onSuccess?.(result),
        onError: (error) => options.onError?.(error),
      });
    },
    isUpdatingSettings: mutation.isPending,
  };
};

export const useGroupAvatar = (groupId: string | null) => {
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!groupId) throw new Error('Group ID missing');
      const formData = new FormData();
      formData.append('avatar', file);
      const response = await apiClient.post(`/auth/groups/${groupId}/avatar`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groupDetails', groupId] });
      queryClient.invalidateQueries({ queryKey: ['userGroups'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!groupId) throw new Error('Group ID missing');
      await apiClient.delete(`/auth/groups/${groupId}/avatar`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groupDetails', groupId] });
      queryClient.invalidateQueries({ queryKey: ['userGroups'] });
    },
  });

  return {
    uploadAvatar: uploadMutation.mutate,
    isUploadingAvatar: uploadMutation.isPending,
    uploadAvatarError: uploadMutation.error,
    deleteAvatar: deleteMutation.mutate,
    isDeletingAvatar: deleteMutation.isPending,
  };
};

export interface GroupLink {
  id: string;
  title: string;
  url: string;
  description?: string;
  icon: string;
}

export const useGroupLinks = (groupId: string | null) => {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['groupDetails', groupId] });
  };

  const addMutation = useMutation({
    mutationFn: async (link: Omit<GroupLink, 'id'>) => {
      if (!groupId) throw new Error('Group ID missing');
      const response = await apiClient.post(`/auth/groups/${groupId}/links`, link);
      return response.data.link as GroupLink;
    },
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ linkId, ...link }: Omit<GroupLink, 'id'> & { linkId: string }) => {
      if (!groupId) throw new Error('Group ID missing');
      const response = await apiClient.put(`/auth/groups/${groupId}/links/${linkId}`, link);
      return response.data.link as GroupLink;
    },
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: async (linkId: string) => {
      if (!groupId) throw new Error('Group ID missing');
      await apiClient.delete(`/auth/groups/${groupId}/links/${linkId}`);
    },
    onSuccess: invalidate,
  });

  return {
    addLink: addMutation.mutate,
    isAddingLink: addMutation.isPending,
    updateLink: updateMutation.mutate,
    isUpdatingLink: updateMutation.isPending,
    deleteLink: deleteMutation.mutate,
    isDeletingLink: deleteMutation.isPending,
  };
};

export const getGroupInitials = (groupName: string | null | undefined): string => {
  if (!groupName) return 'G';

  if (!groupName.includes(' ')) {
    return groupName.substring(0, 2).toUpperCase();
  }

  const words = groupName.split(' ');
  return (words[0][0] + (words[1] ? words[1][0] : '')).toUpperCase();
};

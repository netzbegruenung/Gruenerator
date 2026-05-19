import {
  useAddGroupLink,
  useCreateGroup,
  useDeleteGroup,
  useDeleteGroupAvatar,
  useDeleteGroupLink,
  useGroupDetails as useGroupDetailsShared,
  useGroupMembers as useGroupMembersShared,
  useJoinGroup,
  useLeaveGroup,
  useUpdateGroupLink,
  useUpdateMemberRole as useUpdateMemberRoleShared,
  useUploadGroupAvatar,
  useUserGroups,
  getGroupInitials,
  GROUPS_QUERY_KEY,
  groupDetailsKey,
  type GroupLink,
  type GroupMember,
  type GroupSummary,
} from '@gruenerator/shared/groups';
import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import apiClient from '../../../components/utils/apiClient';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { useAuthStore } from '../../../stores/authStore';

// Re-exports so existing `import { type GroupSummary } from '../hooks/useGroups'`
// call sites continue to resolve without churn.
export { getGroupInitials, type GroupLink, type GroupMember, type GroupSummary };

export const useGroupDetails = useGroupDetailsShared;

// ts-rest widens the body to `unknown` for non-2xx statuses; read `message`
// defensively rather than asserting the error-schema shape.
function errMessage(body: unknown, fallback = 'Aktion fehlgeschlagen.'): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const m = (body as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return fallback;
}

interface MutationOptions<T = unknown> {
  onSuccess?: (result: T) => void;
  onError?: (error: Error) => void;
}

interface UseGroupsOptions {
  isActive?: boolean;
}

// ── Facade around shared CRUD hooks ──
//
// The web call sites destructure a flat bag of fields (userGroups,
// createGroup, isCreatingGroup, updateGroupInfo, joinGroup, …). This
// preserves that shape while the underlying implementation now lives
// in `@gruenerator/shared/groups`.
export const useGroups = ({ isActive }: UseGroupsOptions = {}) => {
  const { user, isAuthenticated, loading: authLoading } = useOptimizedAuth();
  const queryClient = useQueryClient();

  const query = useUserGroups({
    enabled: !!user?.id && isAuthenticated && !authLoading && !!isActive,
  });

  const createMutation = useCreateGroup();
  const deleteMutation = useDeleteGroup();
  const joinMutation = useJoinGroup();

  // Info/name mutations accept a groupId per invocation — they can't use
  // the shared `useUpdateGroupInfo(groupId)` hook (which binds at hook
  // time). Local mutations preserve per-call targeting while still
  // invalidating the right query keys.
  const updateInfoMutation = useMutation({
    mutationFn: async (input: { groupId: string; name?: string; description?: string }) => {
      const { groupId, ...body } = input;
      const res = await getContractsClient().groups.updateInfo({ params: { groupId }, body });
      if (res.status !== 200) throw new Error(errMessage(res.body));
      return { groupId, data: res.body };
    },
    onSuccess: ({ groupId }) => {
      void queryClient.invalidateQueries({ queryKey: GROUPS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: groupDetailsKey(groupId) });
    },
  });

  const updateNameMutation = useMutation({
    mutationFn: async (input: { groupId: string; name: string }) => {
      const res = await getContractsClient().groups.updateName({
        params: { groupId: input.groupId },
        body: { name: input.name },
      });
      if (res.status !== 200) throw new Error(errMessage(res.body));
      return { groupId: input.groupId, data: res.body };
    },
    onSuccess: ({ groupId }) => {
      void queryClient.invalidateQueries({ queryKey: GROUPS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: groupDetailsKey(groupId) });
    },
  });

  const createGroup = (groupName: string, options: MutationOptions<GroupSummary> = {}) => {
    createMutation.mutate(
      { name: groupName },
      {
        onSuccess: (group) => options.onSuccess?.(group),
        onError: (err) => options.onError?.(err as Error),
      }
    );
  };

  const deleteGroup = (groupId: string, options: MutationOptions<string> = {}) => {
    deleteMutation.mutate(groupId, {
      onSuccess: (id) => options.onSuccess?.(id),
      onError: (err) => options.onError?.(err as Error),
    });
  };

  const updateGroupInfo = (
    groupId: string,
    input: { name: string; description?: string },
    options: MutationOptions = {}
  ) => {
    updateInfoMutation.mutate(
      { groupId, ...input },
      {
        onSuccess: ({ data }) => options.onSuccess?.(data),
        onError: (err) => options.onError?.(err as Error),
      }
    );
  };

  const updateGroupName = (groupId: string, name: string, options: MutationOptions = {}) => {
    updateNameMutation.mutate(
      { groupId, name },
      {
        onSuccess: ({ data }) => options.onSuccess?.(data),
        onError: (err) => options.onError?.(err as Error),
      }
    );
  };

  const joinGroup = (joinToken: string, options: MutationOptions = {}) => {
    joinMutation.mutate(joinToken, {
      onSuccess: (result) => options.onSuccess?.(result),
      onError: (err) => options.onError?.(err as Error),
    });
  };

  return {
    userGroups: query.data ?? ([] as GroupSummary[]),
    isLoadingGroups: query.isPending,
    isFetchingGroups: query.isFetching,
    isErrorGroups: query.isError,
    errorGroups: query.error,
    refetchGroups: query.refetch,

    createGroup,
    isCreatingGroup: createMutation.isPending,
    isCreateGroupError: createMutation.isError,
    createGroupError: createMutation.error,
    isCreateGroupSuccess: createMutation.isSuccess,

    deleteGroup,
    isDeletingGroup: deleteMutation.isPending,
    deletingGroupId: deleteMutation.isPending ? (deleteMutation.variables ?? null) : null,
    isDeleteGroupError: deleteMutation.isError,
    deleteGroupError: deleteMutation.error,
    isDeleteGroupSuccess: deleteMutation.isSuccess,

    updateGroupInfo,
    updateGroupName,
    isUpdatingGroupName: updateNameMutation.isPending,
    isUpdateGroupNameError: updateNameMutation.isError,
    updateGroupNameError: updateNameMutation.error,
    isUpdateGroupNameSuccess: updateNameMutation.isSuccess,
    isUpdatingGroupInfo: updateInfoMutation.isPending,
    isUpdateGroupInfoError: updateInfoMutation.isError,
    updateGroupInfoError: updateInfoMutation.error,
    isUpdateGroupInfoSuccess: updateInfoMutation.isSuccess,

    joinGroup,
    isJoiningGroup: joinMutation.isPending,
    isJoinGroupError: joinMutation.isError,
    joinGroupError: joinMutation.error,
    isJoinGroupSuccess: joinMutation.isSuccess,

    isSaving:
      createMutation.isPending ||
      deleteMutation.isPending ||
      updateInfoMutation.isPending ||
      updateNameMutation.isPending ||
      joinMutation.isPending,
    clearMessages: () => {
      createMutation.reset();
      deleteMutation.reset();
      updateInfoMutation.reset();
      updateNameMutation.reset();
      joinMutation.reset();
    },
  };
};

// Re-exported hook kept for compatibility with existing callers
// that expect `useLeaveGroup` / `useGroupDetails` in this module.
export { useLeaveGroup };

export const useGroupMembers = (groupId: string | null, _options: UseGroupsOptions = {}) => {
  const query = useGroupMembersShared(groupId);
  return {
    members: query.data ?? ([] as GroupMember[]),
    isLoadingMembers: query.isPending,
    isFetchingMembers: query.isFetching,
    isErrorMembers: query.isError,
    errorMembers: query.error,
    refetchMembers: query.refetch,
  };
};

export const useUpdateMemberRole = (groupId: string) => {
  const mutation = useUpdateMemberRoleShared(groupId);
  return {
    updateMemberRole: mutation.mutate,
    isUpdatingRole: mutation.isPending,
  };
};

// ── Content sharing (web-only — not ported to shared) ─────────────
// The docs/texts/vorlagen picker depends on web-specific content hooks,
// so this stays local. Mobile defers this feature.

interface GroupContentData {
  [key: string]: unknown[];
}

interface ContentResponse {
  content?: Record<string, unknown[]>;
}

export const useGroupSharing = (groupId: string | null, _options: UseGroupsOptions = {}) => {
  const { user, isAuthenticated, loading: authLoading } = useOptimizedAuth();
  const queryClient = useQueryClient();

  const groupContentQueryKey = ['groupContent', groupId];

  const fetchGroupContentFn = async (): Promise<GroupContentData> => {
    if (!user?.id || !groupId) {
      throw new Error('User not authenticated or group ID missing');
    }
    const response = await apiClient.get<ContentResponse>(`/auth/groups/${groupId}/content`);
    return (response.data.content ?? {}) as GroupContentData;
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
      void queryClient.invalidateQueries({ queryKey: groupContentQueryKey });
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

export const useCloneCanvasTemplate = () => {
  return useMutation({
    mutationFn: async (canvasId: string) => {
      const response = await apiClient.post<{ newCanvasId: string }>(`/canvas/${canvasId}/clone`);
      return response.data;
    },
  });
};

export const useUpdateGroupSettings = (groupId: string | null) => {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (settings: Record<string, unknown>) => {
      if (!user?.id || !groupId) {
        throw new Error('User not authenticated or group ID missing');
      }
      const res = await getContractsClient().groups.updateInfo({
        params: { groupId },
        body: { settings },
      });
      if (res.status !== 200) throw new Error(errMessage(res.body));
      return res.body;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['groupDetails'] });
      void queryClient.invalidateQueries({ queryKey: ['groupVorlagen', groupId] });
    },
  });

  return {
    updateSettings: (settings: Record<string, unknown>, options: MutationOptions = {}) => {
      mutation.mutate(settings, {
        onSuccess: (result) => options.onSuccess?.(result),
        onError: (error) => options.onError?.(error as Error),
      });
    },
    isUpdatingSettings: mutation.isPending,
  };
};

export const useGroupAvatar = (groupId: string | null) => {
  const uploadMutation = useUploadGroupAvatar(groupId ?? '');
  const deleteMutation = useDeleteGroupAvatar(groupId ?? '');
  return {
    uploadAvatar: uploadMutation.mutate,
    isUploadingAvatar: uploadMutation.isPending,
    uploadAvatarError: uploadMutation.error,
    deleteAvatar: deleteMutation.mutate,
    isDeletingAvatar: deleteMutation.isPending,
  };
};

export const useGroupLinks = (groupId: string | null) => {
  const addMutation = useAddGroupLink(groupId ?? '');
  const updateMutation = useUpdateGroupLink(groupId ?? '');
  const deleteMutation = useDeleteGroupLink(groupId ?? '');
  return {
    addLink: addMutation.mutate,
    isAddingLink: addMutation.isPending,
    updateLink: updateMutation.mutate,
    isUpdatingLink: updateMutation.isPending,
    deleteLink: deleteMutation.mutate,
    isDeletingLink: deleteMutation.isPending,
  };
};

import { type GroupContentType } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import {
  errMessage,
  useAddGroupLink,
  useCreateGroup,
  useDeleteGroup,
  useDeleteGroupAvatar,
  useDeleteGroupLink,
  useGroupDetails as useGroupDetailsShared,
  useGroupMembers as useGroupMembersShared,
  useJoinGroup,
  useLeaveGroup,
  useSetGroupMute,
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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import apiClient from '../../../components/utils/apiClient';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { useAuthStore } from '../../../stores/authStore';

// Re-exports so existing `import { type GroupSummary } from '../hooks/useGroups'`
// call sites continue to resolve without churn.
export { getGroupInitials, type GroupLink, type GroupMember, type GroupSummary };

export const useGroupDetails = useGroupDetailsShared;

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

// Re-exported hooks kept for compatibility with existing callers
// that expect `useLeaveGroup` / `useGroupDetails` / `useSetGroupMute` here.
export { useLeaveGroup, useSetGroupMute };

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

export const useGroupSharing = (groupId: string | null, _options: UseGroupsOptions = {}) => {
  const { user, isAuthenticated, loading: authLoading } = useOptimizedAuth();
  const queryClient = useQueryClient();

  const groupContentQueryKey = ['groupContent', groupId];

  const fetchGroupContentFn = async (): Promise<GroupContentData> => {
    if (!user?.id || !groupId) {
      throw new Error('User not authenticated or group ID missing');
    }
    const res = await getContractsClient().groups.listGroupContent({ params: { groupId } });
    if (res.status !== 200) throw new Error('Fehler beim Laden der Gruppeninhalte.');
    return res.body.content as GroupContentData;
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
      if (!groupId) throw new Error('Group ID missing');
      const res = await getContractsClient().groups.removeGroupContent({
        params: { groupId, contentId },
        body: { contentType: contentType as GroupContentType },
      });
      if (res.status !== 200) throw new Error(errMessage(res.body));
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
      const result = await getContractsClient().canvas.clone({
        params: { id: canvasId },
        body: {},
      });
      if (result.status !== 201) {
        throw new Error(`Failed to clone canvas (HTTP ${result.status})`);
      }
      return result.body;
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
      void queryClient.invalidateQueries({ queryKey: groupDetailsKey(groupId ?? '') });
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

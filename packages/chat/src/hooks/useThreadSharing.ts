import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useChatConfigStore } from '../stores/chatConfigStore';

interface GroupShare {
  group_id: string;
  group_name: string;
  shared_at: string;
}

interface UserGroup {
  id: string;
  name: string;
  role: string;
}

export function useThreadSharing(threadId: string | null) {
  const fetchFn = useChatConfigStore((s) => s.fetch);
  const queryClient = useQueryClient();
  const sharesKey = ['thread-shares', threadId] as const;
  const userGroupsKey = ['thread-user-groups'] as const;

  const sharesQuery = useQuery<GroupShare[]>({
    queryKey: sharesKey,
    queryFn: async () => {
      const r = await fetchFn(`/api/chat-service/threads/${threadId}/groups`);
      if (!r.ok) return [];
      const data: unknown = await r.json();
      return Array.isArray(data) ? (data as GroupShare[]) : [];
    },
    enabled: Boolean(threadId),
  });

  const userGroupsQuery = useQuery<UserGroup[]>({
    queryKey: userGroupsKey,
    queryFn: async () => {
      const r = await fetchFn('/api/chat-service/threads/user-groups');
      if (!r.ok) return [];
      const data: unknown = await r.json();
      return Array.isArray(data) ? (data as UserGroup[]) : [];
    },
    enabled: Boolean(threadId),
  });

  const invalidateShares = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: sharesKey });
  }, [queryClient, sharesKey]);

  const shareMutation = useMutation({
    mutationFn: async (groupId: string) => {
      if (!threadId) return;
      await fetchFn(`/api/chat-service/threads/${threadId}/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: groupId }),
      });
    },
    onSuccess: invalidateShares,
  });

  const unshareMutation = useMutation({
    mutationFn: async (groupId: string) => {
      if (!threadId) return;
      await fetchFn(`/api/chat-service/threads/${threadId}/groups/${groupId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: invalidateShares,
  });

  const shareWithGroup = useCallback(
    async (groupId: string) => {
      await shareMutation.mutateAsync(groupId);
    },
    [shareMutation]
  );

  const unshare = useCallback(
    async (groupId: string) => {
      await unshareMutation.mutateAsync(groupId);
    },
    [unshareMutation]
  );

  const reload = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: sharesKey }),
      queryClient.invalidateQueries({ queryKey: userGroupsKey }),
    ]);
  }, [queryClient, sharesKey, userGroupsKey]);

  return {
    sharedGroups: sharesQuery.data ?? [],
    userGroups: userGroupsQuery.data ?? [],
    loading: sharesQuery.isLoading || userGroupsQuery.isLoading,
    shareWithGroup,
    unshare,
    reload,
  };
}

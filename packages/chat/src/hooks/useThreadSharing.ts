import { ApiError } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { notifyError } from '../lib/notify';
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
  const sharesKey = useMemo(() => ['thread-shares', threadId] as const, [threadId]);
  const userGroupsKey = useMemo(() => ['thread-user-groups'] as const, []);

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

  // Both mutations used to ignore the response status. `fetch` resolves on 4xx
  // and 5xx, so a rejected share ran onSuccess, refetched an unchanged list and
  // reported nothing — the user clicked "Teilen" and simply saw no effect.
  const shareMutation = useMutation({
    mutationFn: async (groupId: string) => {
      if (!threadId) return;
      const r = await fetchFn(`/api/chat-service/threads/${threadId}/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: groupId }),
      });
      if (!r.ok) throw new ApiError(r.status, 'Teilen fehlgeschlagen');
    },
    onSuccess: invalidateShares,
    onError: () =>
      notifyError('Chat konnte nicht geteilt werden', 'Bitte versuche es noch einmal.'),
  });

  const unshareMutation = useMutation({
    mutationFn: async (groupId: string) => {
      if (!threadId) return;
      const r = await fetchFn(`/api/chat-service/threads/${threadId}/groups/${groupId}`, {
        method: 'DELETE',
      });
      if (!r.ok) throw new ApiError(r.status, 'Freigabe konnte nicht entfernt werden');
    },
    onSuccess: invalidateShares,
    onError: () =>
      notifyError('Freigabe konnte nicht entfernt werden', 'Bitte versuche es noch einmal.'),
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

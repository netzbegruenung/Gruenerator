import { type GroupShareMode, type ThreadShareMode } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { notifyError } from '../lib/notify';

/** Kept snake_case for source compatibility with existing consumers
 *  (web dialog + mobile ThreadShareSheet predate the contract). */
interface GroupShare {
  group_id: string;
  group_name: string;
  shared_at: string;
  /** 'write' = Mitarbeiten (legacy default), 'read' = Nur lesen. */
  mode: GroupShareMode;
}

interface UserGroup {
  id: string;
  name: string;
  role: string;
}

export function useThreadSharing(threadId: string | null) {
  const queryClient = useQueryClient();
  const sharesKey = useMemo(() => ['thread-shares', threadId] as const, [threadId]);
  const userGroupsKey = useMemo(() => ['thread-user-groups'] as const, []);
  const shareModeKey = useMemo(() => ['thread-share-mode', threadId] as const, [threadId]);

  const sharesQuery = useQuery<GroupShare[]>({
    queryKey: sharesKey,
    queryFn: async () => {
      const res = await getContractsClient().chatThreadSharing.listGroupShares({
        params: { threadId: threadId! },
      });
      if (res.status !== 200) return [];
      return res.body.map((s) => ({
        group_id: s.groupId,
        group_name: s.groupName,
        shared_at: s.sharedAt,
        mode: s.mode,
      }));
    },
    enabled: Boolean(threadId),
  });

  const userGroupsQuery = useQuery<UserGroup[]>({
    queryKey: userGroupsKey,
    queryFn: async () => {
      const res = await getContractsClient().chatThreadSharing.listUserGroups();
      return res.status === 200 ? res.body : [];
    },
    enabled: Boolean(threadId),
  });

  // Link share state + the slug parts the dialog needs to build the URL.
  // resolveShared serves both the archive page and the owner dialog.
  const shareModeQuery = useQuery({
    queryKey: shareModeKey,
    queryFn: async () => {
      const res = await getContractsClient().chatThreadSharing.resolveShared({
        params: { slugOrId: threadId! },
      });
      if (res.status !== 200) return null;
      return res.body;
    },
    enabled: Boolean(threadId),
  });

  const invalidateShares = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: sharesKey });
  }, [queryClient, sharesKey]);

  const shareMutation = useMutation({
    mutationFn: async ({ groupId, mode }: { groupId: string; mode: GroupShareMode }) => {
      if (!threadId) return;
      const res = await getContractsClient().chatThreadSharing.shareWithGroup({
        params: { threadId },
        body: { groupId, mode },
      });
      if (res.status !== 200) throw new Error(`Teilen fehlgeschlagen (HTTP ${res.status})`);
    },
    onSuccess: invalidateShares,
    onError: () =>
      notifyError('Chat konnte nicht geteilt werden', 'Bitte versuche es noch einmal.'),
  });

  const unshareMutation = useMutation({
    mutationFn: async (groupId: string) => {
      if (!threadId) return;
      const res = await getContractsClient().chatThreadSharing.unshareGroup({
        params: { threadId, groupId },
      });
      if (res.status !== 200)
        throw new Error(`Freigabe konnte nicht entfernt werden (HTTP ${res.status})`);
    },
    onSuccess: invalidateShares,
    onError: () =>
      notifyError('Freigabe konnte nicht entfernt werden', 'Bitte versuche es noch einmal.'),
  });

  const shareModeMutation = useMutation({
    mutationFn: async (shareMode: ThreadShareMode) => {
      if (!threadId) return;
      const res = await getContractsClient().chatThreadSharing.updateShareMode({
        params: { threadId },
        body: { shareMode },
      });
      if (res.status !== 200) throw new Error(`Link-Freigabe fehlgeschlagen (HTTP ${res.status})`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: shareModeKey });
    },
    onError: () =>
      notifyError('Link-Freigabe konnte nicht geändert werden', 'Bitte versuche es noch einmal.'),
  });

  const shareWithGroup = useCallback(
    async (groupId: string, mode: GroupShareMode = 'write') => {
      await shareMutation.mutateAsync({ groupId, mode });
    },
    [shareMutation]
  );

  const unshare = useCallback(
    async (groupId: string) => {
      await unshareMutation.mutateAsync(groupId);
    },
    [unshareMutation]
  );

  const setShareMode = useCallback(
    async (shareMode: ThreadShareMode) => {
      await shareModeMutation.mutateAsync(shareMode);
    },
    [shareModeMutation]
  );

  const reload = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: sharesKey }),
      queryClient.invalidateQueries({ queryKey: userGroupsKey }),
      queryClient.invalidateQueries({ queryKey: shareModeKey }),
    ]);
  }, [queryClient, sharesKey, userGroupsKey, shareModeKey]);

  return {
    sharedGroups: sharesQuery.data ?? [],
    userGroups: userGroupsQuery.data ?? [],
    loading: sharesQuery.isLoading || userGroupsQuery.isLoading,
    shareWithGroup,
    unshare,
    reload,
    /** Link share ("Per Link teilen"): current mode + parts for the URL. */
    shareMode: (shareModeQuery.data?.shareMode ?? 'private') as ThreadShareMode,
    slugSuffix: shareModeQuery.data?.slugSuffix ?? null,
    threadTitle: shareModeQuery.data?.title ?? null,
    shareModeLoading: shareModeQuery.isLoading || shareModeMutation.isPending,
    setShareMode,
  };
}

import { useState, useEffect, useCallback } from 'react';
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
  const [sharedGroups, setSharedGroups] = useState<GroupShare[]>([]);
  const [userGroups, setUserGroups] = useState<UserGroup[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!threadId) return;
    setLoading(true);
    try {
      const [shares, groups] = await Promise.all([
        fetchFn(`/api/chat-service/threads/${threadId}/groups`).then((r) => (r.ok ? r.json() : [])),
        fetchFn('/api/chat-service/threads/user-groups').then((r) => (r.ok ? r.json() : [])),
      ]);
      setSharedGroups(Array.isArray(shares) ? shares : []);
      setUserGroups(Array.isArray(groups) ? groups : []);
    } catch {
      setSharedGroups([]);
      setUserGroups([]);
    }
    setLoading(false);
  }, [threadId, fetchFn]);

  useEffect(() => {
    load();
  }, [load]);

  const shareWithGroup = useCallback(
    async (groupId: string) => {
      if (!threadId) return;
      await fetchFn(`/api/chat-service/threads/${threadId}/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: groupId }),
      });
      await load();
    },
    [threadId, fetchFn, load]
  );

  const unshare = useCallback(
    async (groupId: string) => {
      if (!threadId) return;
      await fetchFn(`/api/chat-service/threads/${threadId}/groups/${groupId}`, {
        method: 'DELETE',
      });
      await load();
    },
    [threadId, fetchFn, load]
  );

  return { sharedGroups, userGroups, loading, shareWithGroup, unshare, reload: load };
}

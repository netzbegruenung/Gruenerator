import { getContractsClient, getGlobalApiClient } from '@gruenerator/shared/api';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  metadata: Record<string, unknown>;
  action_url: string | null;
  group_key: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

const PAGE_SIZE = 20;
const POLL_INTERVAL = 60000;

export function useUnreadCount() {
  const [count, setCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch = useCallback(async () => {
    try {
      // Typed: the untyped read looked for `unreadCount`, the API sends `count`.
      const res = await getContractsClient().notifications.getUnreadCount();
      if (res.status === 200) setCount(res.body.count);
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    void fetch();
    timerRef.current = setInterval(() => void fetch(), POLL_INTERVAL);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetch]);

  return { count, refetch: fetch };
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const fetchPage = useCallback(async (offset: number) => {
    // Typed: the API returns a bare array, not `{ notifications }`.
    const res = await getContractsClient().notifications.list({
      query: { limit: String(PAGE_SIZE), offset: String(offset) },
    });
    if (res.status !== 200) throw new Error(`Failed to fetch notifications (HTTP ${res.status})`);
    return res.body;
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const items = await fetchPage(0);
      setNotifications(items);
      setHasMore(items.length >= PAGE_SIZE);
    } catch {
      setNotifications([]);
    } finally {
      setIsLoading(false);
    }
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const items = await fetchPage(notifications.length);
      setNotifications((prev) => [...prev, ...items]);
      setHasMore(items.length >= PAGE_SIZE);
    } catch {
      /* ignore */
    } finally {
      setIsLoadingMore(false);
    }
  }, [fetchPage, notifications.length, isLoadingMore, hasMore]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const markAsRead = useCallback(async (id: string) => {
    try {
      const client = getGlobalApiClient();
      await client.patch(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n
        )
      );
    } catch {
      /* ignore */
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      const client = getGlobalApiClient();
      await client.patch('/notifications/read-all');
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
      );
    } catch {
      /* ignore */
    }
  }, []);

  const dismiss = useCallback(async (id: string) => {
    try {
      const client = getGlobalApiClient();
      await client.delete(`/notifications/${id}`);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch {
      /* ignore */
    }
  }, []);

  return {
    notifications,
    isLoading,
    isLoadingMore,
    hasMore,
    refresh,
    loadMore,
    markAsRead,
    markAllAsRead,
    dismiss,
  };
}

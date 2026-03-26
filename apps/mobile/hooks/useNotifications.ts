import { getGlobalApiClient } from '@gruenerator/shared/api';
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
      const client = getGlobalApiClient();
      const res = await client.get('/notifications/unread-count');
      setCount(res.data?.unreadCount ?? 0);
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetch();
    timerRef.current = setInterval(fetch, POLL_INTERVAL);
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
    const client = getGlobalApiClient();
    const res = await client.get(`/notifications?limit=${PAGE_SIZE}&offset=${offset}`);
    return (res.data?.notifications ?? []) as AppNotification[];
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
    } catch {} finally {
      setIsLoadingMore(false);
    }
  }, [fetchPage, notifications.length, isLoadingMore, hasMore]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const markAsRead = useCallback(async (id: string) => {
    try {
      const client = getGlobalApiClient();
      await client.patch(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
      );
    } catch {}
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      const client = getGlobalApiClient();
      await client.patch('/notifications/read-all');
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
      );
    } catch {}
  }, []);

  const dismiss = useCallback(async (id: string) => {
    try {
      const client = getGlobalApiClient();
      await client.delete(`/notifications/${id}`);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch {}
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

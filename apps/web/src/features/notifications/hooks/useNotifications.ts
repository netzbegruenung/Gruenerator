import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';

import {
  fetchNotificationsPage,
  fetchUnreadCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  dismissNotificationById,
  dismissAllNotificationsClient,
} from '../../../hooks/useNotificationsTyped';
import { useAuthStore } from '../../../stores/authStore';
import { useNotificationStore } from '../../../stores/notificationStore';

import type { Notification } from '../types';

const QUERY_KEY = ['notifications'];
const PAGE_SIZE = 20;

export function useNotifications() {
  return useInfiniteQuery({
    queryKey: QUERY_KEY,
    queryFn: async ({ pageParam = 0 }) => {
      return fetchNotificationsPage(PAGE_SIZE, pageParam as number) as Promise<Notification[]>;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return allPages.length * PAGE_SIZE;
    },
  });
}

export function useUnreadCount() {
  const setUnreadCount = useNotificationStore((s) => s.setUnreadCount);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => {
      const count = await fetchUnreadCount();
      setUnreadCount(count);
      return count;
    },
    // ProfileButton mounts on every route (including /login), but the
    // unread-count endpoint requires auth. Without this gate, guests get
    // a 401-retry storm that surfaces as an "Unerwarteter Fehler" toast
    // and incidentally triggers apiClient's 401-recovery session probe.
    enabled: isAuthenticated,
    retry: false,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnMount: false,
  });
}

export function useMarkAsRead() {
  const queryClient = useQueryClient();
  const decrementUnreadCount = useNotificationStore((s) => s.decrementUnreadCount);

  return useMutation({
    mutationFn: async (notificationId: string) => {
      await markNotificationAsRead(notificationId);
    },
    onSuccess: () => {
      decrementUnreadCount();
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useMarkAllAsRead() {
  const queryClient = useQueryClient();
  const setUnreadCount = useNotificationStore((s) => s.setUnreadCount);

  return useMutation({
    mutationFn: async () => {
      await markAllNotificationsAsRead();
    },
    onSuccess: () => {
      setUnreadCount(0);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useDismissNotification() {
  const queryClient = useQueryClient();
  const decrementUnreadCount = useNotificationStore((s) => s.decrementUnreadCount);

  return useMutation({
    mutationFn: async ({ id, isUnread }: { id: string; isUnread: boolean }) => {
      await dismissNotificationById(id);
      return { isUnread };
    },
    onSuccess: (_, { isUnread }) => {
      if (isUnread) decrementUnreadCount();
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useDismissAll() {
  const queryClient = useQueryClient();
  const setUnreadCount = useNotificationStore((s) => s.setUnreadCount);

  return useMutation({
    mutationFn: async () => {
      await dismissAllNotificationsClient();
    },
    onSuccess: () => {
      setUnreadCount(0);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

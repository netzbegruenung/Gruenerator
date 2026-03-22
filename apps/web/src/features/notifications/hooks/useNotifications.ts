import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';

import apiClient from '../../../components/utils/apiClient';
import { useNotificationStore } from '../../../stores/notificationStore';

import type { Notification } from '../types';

const QUERY_KEY = ['notifications'];
const PAGE_SIZE = 20;

export function useNotifications() {
  return useInfiniteQuery({
    queryKey: QUERY_KEY,
    queryFn: async ({ pageParam = 0 }) => {
      const res = await apiClient.get<Notification[]>('/notifications', {
        params: { limit: PAGE_SIZE, offset: pageParam },
      });
      return res.data;
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

  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => {
      const res = await apiClient.get<{ count: number }>('/notifications/unread-count');
      setUnreadCount(res.data.count);
      return res.data.count;
    },
    refetchInterval: 60000,
  });
}

export function useMarkAsRead() {
  const queryClient = useQueryClient();
  const decrementUnreadCount = useNotificationStore((s) => s.decrementUnreadCount);

  return useMutation({
    mutationFn: async (notificationId: string) => {
      await apiClient.patch(`/notifications/${notificationId}/read`);
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
      await apiClient.patch('/notifications/read-all');
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
      await apiClient.delete(`/notifications/${id}`);
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
      await apiClient.delete('/notifications');
    },
    onSuccess: () => {
      setUnreadCount(0);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

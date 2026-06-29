import {
  useMutation,
  useQueryClient,
  useInfiniteQuery,
  type InfiniteData,
} from '@tanstack/react-query';

import {
  fetchNotificationsPage,
  markNotificationAsRead,
  dismissNotificationById,
  dismissAllNotificationsClient,
} from '../../../hooks/useNotificationsTyped';
import { useAuthStore } from '../../../stores/authStore';

import type { Notification } from '../types';

const QUERY_KEY = ['notifications'];
const PAGE_SIZE = 20;

type NotificationPages = InfiniteData<Notification[]>;

// Drop a notification from every cached page (optimistic removal). In the
// unread-only list, both marking-as-read and dismissing remove the row.
function removeFromPages(
  old: NotificationPages | undefined,
  id: string
): NotificationPages | undefined {
  if (!old) return old;
  return { ...old, pages: old.pages.map((page) => page.filter((n) => n.id !== id)) };
}

/**
 * The single source of truth for unread notifications on web: the popover list
 * AND the bell badge both derive from this one query (shared cache key), so they
 * can never disagree. Mounted always (gated by auth) so the badge stays fresh
 * even while the popover is closed; SSE/mutations invalidate it to reconcile.
 */
export function useNotifications() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

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
    // Gate on auth: this runs on every route (SidebarAccount), and the endpoint
    // requires auth — without the gate, guests get a 401-retry storm.
    enabled: isAuthenticated,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });
}

export function useMarkAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      await markNotificationAsRead(notificationId);
    },
    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<NotificationPages>(QUERY_KEY);
      queryClient.setQueryData<NotificationPages>(QUERY_KEY, (old) =>
        removeFromPages(old, notificationId)
      );
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(QUERY_KEY, ctx.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useDismissNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    // isUnread is accepted for call-site compatibility; the unread-only list
    // removes the row regardless, so it is no longer needed here.
    mutationFn: async ({ id }: { id: string; isUnread: boolean }) => {
      await dismissNotificationById(id);
    },
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<NotificationPages>(QUERY_KEY);
      queryClient.setQueryData<NotificationPages>(QUERY_KEY, (old) => removeFromPages(old, id));
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(QUERY_KEY, ctx.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useDismissAll() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await dismissAllNotificationsClient();
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<NotificationPages>(QUERY_KEY);
      queryClient.setQueryData<NotificationPages>(QUERY_KEY, (old) =>
        old ? { ...old, pages: old.pages.map(() => []) } : old
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(QUERY_KEY, ctx.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

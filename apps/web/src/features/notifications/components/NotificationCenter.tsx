import {
  NotificationBell,
  Item,
  ItemMedia,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
  ItemGroup,
  ItemSeparator,
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  ScrollArea,
  Button,
  Separator,
} from '@gruenerator/ui';
import { Bell, FileText, LayoutDashboard, Users, CheckCheck } from 'lucide-react';
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { useBetaFeatures } from '../../../hooks/useBetaFeatures';
import { useNotificationSSE } from '../../../hooks/useNotificationSSE';
import { useNotificationStore } from '../../../stores/notificationStore';
import {
  useNotifications,
  useUnreadCount,
  useMarkAsRead,
  useMarkAllAsRead,
} from '../hooks/useNotifications';

const TYPE_ICONS: Record<string, typeof FileText> = {
  document_shared: FileText,
  document_edited: FileText,
  board_updates: LayoutDashboard,
  group_activity: Users,
};

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Gerade eben';
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `vor ${days} T.`;
  return new Date(dateStr).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}

const NotificationCenter = () => {
  const { canAccessBetaFeature } = useBetaFeatures();
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const navigate = useNavigate();

  useNotificationSSE(
    useCallback((data: { title?: string; body?: string }) => {
      if (data.title) {
        toast(data.title, { description: data.body || undefined });
      }
    }, [])
  );
  useUnreadCount();

  const { data, hasNextPage, fetchNextPage, isFetchingNextPage } = useNotifications();
  const markAsRead = useMarkAsRead();
  const markAllAsRead = useMarkAllAsRead();

  const notifications = data?.pages.flat() ?? [];

  const handleItemClick = useCallback(
    (notificationId: string, actionUrl: string | null, isRead: boolean) => {
      if (!isRead) {
        markAsRead.mutate(notificationId);
      }
      if (actionUrl) {
        navigate(actionUrl);
      }
    },
    [markAsRead, navigate]
  );

  if (!canAccessBetaFeature('workplace')) return null;

  return (
    <NotificationBell unreadCount={unreadCount}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-grey-200 dark:border-grey-700">
        <h3 className="text-sm font-semibold text-foreground-heading">Benachrichtigungen</h3>
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-auto px-2 py-1 text-xs text-primary-600"
            onClick={() => markAllAsRead.mutate()}
          >
            <CheckCheck className="mr-1 size-3" />
            Alle gelesen
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <Empty className="border-0 py-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Bell />
            </EmptyMedia>
            <EmptyTitle className="text-base">Keine neuen Benachrichtigungen</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <ScrollArea className="max-h-[400px]">
          <ItemGroup>
            {notifications.map((notification, idx) => {
              const Icon = TYPE_ICONS[notification.type] ?? Bell;
              return (
                <div key={notification.id}>
                  {idx > 0 && <ItemSeparator />}
                  <Item
                    size="sm"
                    className={`cursor-pointer hover:bg-hover-alt transition-colors ${
                      !notification.is_read ? 'bg-primary-50 dark:bg-primary-900/10' : ''
                    }`}
                    onClick={() =>
                      handleItemClick(
                        notification.id,
                        notification.action_url,
                        notification.is_read
                      )
                    }
                  >
                    <ItemMedia variant="icon">
                      <Icon className="size-4" />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle
                        className={!notification.is_read ? 'font-semibold' : 'font-normal'}
                      >
                        {notification.title}
                      </ItemTitle>
                      {notification.body && <ItemDescription>{notification.body}</ItemDescription>}
                    </ItemContent>
                    <ItemActions>
                      <span className="text-xs text-grey-400 whitespace-nowrap">
                        {formatRelativeTime(notification.created_at)}
                      </span>
                    </ItemActions>
                  </Item>
                </div>
              );
            })}
          </ItemGroup>

          {hasNextPage && (
            <>
              <Separator />
              <div className="p-2 text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => void fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? 'Laden...' : 'Mehr laden'}
                </Button>
              </div>
            </>
          )}
        </ScrollArea>
      )}
    </NotificationBell>
  );
};

export default NotificationCenter;

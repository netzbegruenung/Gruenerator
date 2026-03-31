import { Button, ItemGroup, ItemSeparator, ScrollArea, Separator } from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCheck } from 'lucide-react';
import { memo, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  useNotifications,
  useMarkAsRead,
  useMarkAllAsRead,
  useDismissNotification,
  useDismissAll,
} from '../hooks/useNotifications';
import { getNotificationConfig } from '../notificationConfig';
import { NOTIFICATION_GROUPS } from '../types';

import NotificationGroupComponent from './NotificationGroup';
import NotificationItem from './NotificationItem';

import type { Notification, NotificationGroup as NotificationGroupType } from '../types';

type GroupedEntry =
  | { kind: 'single'; notification: Notification }
  | { kind: 'group'; key: string; items: Notification[] };

interface CategorySection {
  category: NotificationGroupType;
  label: string;
  entries: GroupedEntry[];
}

function groupNotifications(notifications: Notification[]): GroupedEntry[] {
  const groups = new Map<string, Notification[]>();
  const order: (string | Notification)[] = [];

  for (const n of notifications) {
    if (n.group_key) {
      if (!groups.has(n.group_key)) {
        groups.set(n.group_key, []);
        order.push(n.group_key);
      }
      groups.get(n.group_key)!.push(n);
    } else {
      order.push(n);
    }
  }

  return order.map((item) => {
    if (typeof item === 'string') {
      const items = groups.get(item)!;
      if (items.length === 1) {
        return { kind: 'single' as const, notification: items[0] };
      }
      return { kind: 'group' as const, key: item, items };
    }
    return { kind: 'single' as const, notification: item };
  });
}

function getNotificationCategory(entry: GroupedEntry): NotificationGroupType {
  const type = entry.kind === 'group' ? entry.items[0].type : entry.notification.type;
  return (getNotificationConfig(type).group ?? 'system') as NotificationGroupType;
}

function groupByCategory(entries: GroupedEntry[]): CategorySection[] {
  const categoryMap = new Map<NotificationGroupType, GroupedEntry[]>();

  for (const entry of entries) {
    const cat = getNotificationCategory(entry);
    const existing = categoryMap.get(cat) ?? [];
    existing.push(entry);
    categoryMap.set(cat, existing);
  }

  return Array.from(categoryMap.entries())
    .map(([category, catEntries]) => ({
      category,
      label: NOTIFICATION_GROUPS[category]?.label ?? 'Sonstige',
      entries: catEntries,
    }))
    .sort(
      (a, b) =>
        (NOTIFICATION_GROUPS[a.category]?.order ?? 99) -
        (NOTIFICATION_GROUPS[b.category]?.order ?? 99)
    );
}

function formatShortTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'jetzt';
  if (min < 60) return `${min}m`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d`;
  return new Date(dateStr).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}

interface NotificationListProps {
  unreadCount: number;
}

const NotificationList = ({ unreadCount }: NotificationListProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: notifData, hasNextPage, fetchNextPage, isFetchingNextPage } = useNotifications();
  const markAsRead = useMarkAsRead();
  const markAllAsRead = useMarkAllAsRead();
  const dismissNotification = useDismissNotification();
  const dismissAll = useDismissAll();
  const notifications = notifData?.pages.flat() ?? [];

  const grouped = useMemo(() => groupNotifications(notifications), [notifications]);
  const sections = useMemo(() => groupByCategory(grouped), [grouped]);

  const handleMarkAsRead = useCallback((id: string) => markAsRead.mutate(id), [markAsRead]);

  const handleDismiss = useCallback(
    (id: string, isUnread: boolean) => dismissNotification.mutate({ id, isUnread }),
    [dismissNotification]
  );

  const refreshProfile = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: ['profileData'] }),
    [queryClient]
  );

  if (notifications.length === 0) return null;

  return (
    <>
      <div className="flex items-center justify-between px-md pt-xs pb-0 border-t border-grey-200 dark:border-grey-700">
        <span className="text-xs font-medium text-foreground">Benachrichtigungen</span>
        <div className="flex gap-xs">
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-1.5 py-0.5 text-[0.65rem] text-foreground font-normal"
              onClick={() => markAllAsRead.mutate()}
            >
              <CheckCheck className="mr-0.5 size-3" />
              Alle gelesen
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-auto px-1.5 py-0.5 text-[0.65rem] text-foreground font-normal"
            onClick={() => dismissAll.mutate()}
          >
            <CheckCheck className="mr-0.5 size-3" />
            Alle erledigt
          </Button>
        </div>
      </div>

      <ScrollArea className="max-h-[280px]">
        {sections.map((section, sectionIdx) => (
          <div key={section.category}>
            {sectionIdx > 0 && <Separator />}
            <div className="px-md pt-sm pb-xs">
              <span className="text-[0.65rem] font-semibold text-grey-400 dark:text-grey-500 uppercase tracking-wider">
                {section.label}
              </span>
            </div>
            <ItemGroup>
              {section.entries.map((entry, idx) => {
                const key = entry.kind === 'group' ? entry.key : entry.notification.id;
                return (
                  <div key={key}>
                    {idx > 0 && <ItemSeparator />}
                    {entry.kind === 'group' ? (
                      <NotificationGroupComponent
                        items={entry.items}
                        formatTime={formatShortTime}
                        onMarkAsRead={handleMarkAsRead}
                        onDismiss={handleDismiss}
                        navigate={navigate}
                        refreshProfile={refreshProfile}
                      />
                    ) : (
                      <NotificationItem
                        notification={entry.notification}
                        formatTime={formatShortTime}
                        onMarkAsRead={handleMarkAsRead}
                        onDismiss={handleDismiss}
                        navigate={navigate}
                        refreshProfile={refreshProfile}
                      />
                    )}
                  </div>
                );
              })}
            </ItemGroup>
          </div>
        ))}
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
    </>
  );
};

export default memo(NotificationList);

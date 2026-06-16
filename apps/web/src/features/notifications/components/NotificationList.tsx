import { Button, ItemGroup, ItemSeparator, Separator } from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCheck } from 'lucide-react';
import { memo, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  useNotifications,
  useMarkAsRead,
  useDismissNotification,
  useDismissAll,
} from '../hooks/useNotifications';
import {
  groupByCategory,
  groupNotifications,
  formatShortTime,
} from '../utils/notificationGrouping';

import NotificationGroupComponent from './NotificationGroup';
import NotificationItem from './NotificationItem';

const NotificationList = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: notifData, hasNextPage, fetchNextPage, isFetchingNextPage } = useNotifications();
  const markAsRead = useMarkAsRead();
  const dismissNotification = useDismissNotification();
  const dismissAll = useDismissAll();
  const notifications = useMemo(() => notifData?.pages.flat() ?? [], [notifData]);

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

  // Rendered inline inside the account dropdown (not a nested card): bounding
  // separators set it apart, and the list scrolls natively so the menu items
  // below (Einstellungen, Support, …) stay reachable when many are pending.
  return (
    <div className="my-1">
      <Separator className="mb-1" />
      <div className="flex items-center justify-between px-md pb-xs">
        <span className="text-xs font-medium text-foreground">Benachrichtigungen</span>
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

      <div className="max-h-[260px] overflow-y-auto">
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
      </div>
      <Separator className="mt-1" />
    </div>
  );
};

export default memo(NotificationList);

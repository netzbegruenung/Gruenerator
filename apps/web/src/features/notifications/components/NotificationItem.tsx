import { ItemDescription, ItemTitle } from '@gruenerator/ui';
import { Check, X } from 'lucide-react';
import { memo } from 'react';

import {
  getNotificationConfig,
  getNotificationActions,
  truncateBody,
  type NotificationActionContext,
} from '../notificationConfig';

import type { Notification } from '../types';

import { cn } from '@/utils/cn';

interface NotificationItemProps {
  notification: Notification;
  formatTime: (date: string) => string;
  onMarkAsRead: (id: string) => void;
  onDismiss: (id: string, isUnread: boolean) => void;
  navigate: (path: string) => void;
  refreshProfile: () => void;
}

const NotificationItem = memo(
  ({
    notification,
    formatTime,
    onMarkAsRead,
    onDismiss,
    navigate,
    refreshProfile,
  }: NotificationItemProps) => {
    const config = getNotificationConfig(notification.type);
    const ctx: NotificationActionContext = {
      notification,
      navigate,
      markAsRead: onMarkAsRead,
      refreshProfile,
    };
    const actions = getNotificationActions(notification.type, ctx);
    const body = truncateBody(notification.body);

    return (
      <div
        className={cn(
          'group/notif flex gap-sm px-md py-xs transition-colors',
          !notification.is_read && 'bg-primary-50 dark:bg-primary-900/10'
        )}
      >
        <div className="flex flex-col items-center justify-center gap-xxs shrink-0 self-center">
          {config.image ? (
            <div className="size-8 rounded-full overflow-hidden">
              <img src={config.image} alt="" className="size-full object-cover" />
            </div>
          ) : (
            <div className="flex items-center justify-center size-8 rounded-full bg-grey-100 dark:bg-grey-800">
              <config.icon className="size-4 text-grey-500" />
            </div>
          )}
          <span className="text-[0.6rem] text-grey-400 leading-none">
            {formatTime(notification.created_at)}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-xs">
            <div className="min-w-0">
              <ItemTitle
                className={cn(
                  'text-[0.8rem] leading-snug',
                  !notification.is_read ? 'font-semibold' : 'font-normal'
                )}
              >
                {notification.title}
              </ItemTitle>
              {body && (
                <ItemDescription className="text-[0.75rem] leading-snug text-foreground">
                  {body}
                </ItemDescription>
              )}
            </div>
            <div className="shrink-0 hidden group-hover/notif:flex items-center gap-xxs">
              {!notification.is_read && (
                <button
                  type="button"
                  className="flex items-center justify-center size-4 rounded-full text-grey-400 hover:text-primary-500 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMarkAsRead(notification.id);
                  }}
                  aria-label="Als gelesen markieren"
                  title="Als gelesen markieren"
                >
                  <Check className="size-3" />
                </button>
              )}
              <button
                type="button"
                className="flex items-center justify-center size-4 rounded-full text-grey-400 hover:text-foreground transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss(notification.id, !notification.is_read);
                }}
                aria-label="Erledigt"
                title="Erledigt"
              >
                <X className="size-3" />
              </button>
            </div>
          </div>
          {actions.length > 0 && (
            <div className="flex flex-wrap gap-xs mt-xs">
              {actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    action.run(ctx);
                  }}
                  className="flex items-center gap-xxs rounded-full border border-grey-200 dark:border-grey-700 px-xs py-0 text-[0.7rem] leading-relaxed text-foreground hover:border-primary-500 hover:text-primary-500 transition-colors"
                >
                  <action.icon className="size-3" />
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }
);

NotificationItem.displayName = 'NotificationItem';

export default NotificationItem;

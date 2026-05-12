// Display properties (icons, labels, images) are configured in the frontend:
// apps/web/src/features/notifications/notificationConfig.ts
//
// Source of truth for the type/channel enums is the contracts package — both
// the wire schema (Zod) and the TS types are derived from there.
import {
  notificationTypeSchema,
  type NotificationType,
  type NotificationChannel,
  type NotifChannelPreferences,
} from '@gruenerator/contracts';

export type { NotificationType, NotificationChannel };
export type ChannelPreferences = NotifChannelPreferences;

export const ALL_NOTIFICATION_TYPES: readonly NotificationType[] = notificationTypeSchema.options;

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  metadata: Record<string, unknown>;
  action_url: string | null;
  group_key: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
  actionUrl?: string | undefined;
  groupKey?: string | undefined;
}

export interface NotificationListOptions {
  limit?: number | undefined;
  offset?: number | undefined;
  unreadOnly?: boolean | undefined;
}

import { and, count, eq, lt, sql, type InferSelectModel } from 'drizzle-orm';

import { notifications } from '../../database/schema/index.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { sendPushToUser } from '../../services/pushNotificationService.js';
import { createLogger } from '../../utils/logger.js';

import { shouldDeliver, getProfileForDelivery } from './notificationPreferences.js';
import { publishNotification } from './notificationPubSub.js';

import type {
  Notification,
  CreateNotificationParams,
  NotificationListOptions,
  NotificationType,
} from './types.js';

type NotificationRow = InferSelectModel<typeof notifications>;

const log = createLogger('NotificationService');

function toNotification(row: NotificationRow): Notification {
  return {
    ...row,
    type: row.type as NotificationType,
    read_at: row.read_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
  };
}

function firePush(
  userId: string,
  title: string,
  body: string | null,
  type: string,
  actionUrl?: string | null,
  notificationId?: string
) {
  sendPushToUser(userId, {
    title,
    body: body ?? '',
    data: {
      type,
      action_url: actionUrl,
      ...(notificationId ? { notification_id: notificationId } : {}),
    },
  }).catch((err) => {
    log.warn('Failed to send push notification', { userId, error: err.message });
  });
}

export async function createNotification(
  params: CreateNotificationParams
): Promise<NotificationRow | null> {
  const { userId, type, title, body, metadata = {}, actionUrl, groupKey } = params;

  const profile = await getProfileForDelivery(userId);
  const showInApp = await shouldDeliver(userId, type, 'in_app', profile);

  if (!showInApp) {
    const sendPush = await shouldDeliver(userId, type, 'push', profile);
    if (sendPush) firePush(userId, title, body ?? null, type, actionUrl);
    return null;
  }

  const db = getDrizzleInstance();
  const rows = await db
    .insert(notifications)
    .values({
      user_id: userId,
      type,
      title,
      body: body ?? null,
      metadata: metadata,
      action_url: actionUrl ?? null,
      group_key: groupKey ?? null,
    })
    .returning();

  const notification = rows[0];

  publishNotification(userId, toNotification(notification)).catch((err: Error) => {
    log.warn('Failed to publish notification via Redis', { userId, error: err.message });
  });

  const sendPush = await shouldDeliver(userId, type, 'push', profile);
  if (sendPush) firePush(userId, title, body ?? null, type, actionUrl, notification.id);

  return notification;
}

export async function getNotificationsForUser(
  userId: string,
  options: NotificationListOptions = {}
): Promise<NotificationRow[]> {
  const { limit = 20, offset = 0, unreadOnly = false } = options;

  const db = getDrizzleInstance();

  const conditions = unreadOnly
    ? and(eq(notifications.user_id, userId), eq(notifications.is_read, false))
    : eq(notifications.user_id, userId);

  return db
    .select()
    .from(notifications)
    .where(conditions)
    .orderBy(sql`${notifications.created_at} DESC`)
    .limit(limit)
    .offset(offset);
}

export async function getUnreadCount(userId: string): Promise<number> {
  const db = getDrizzleInstance();

  const result = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.user_id, userId), eq(notifications.is_read, false)));

  return result[0]?.value ?? 0;
}

export async function markAsRead(notificationId: string, userId: string): Promise<void> {
  const db = getDrizzleInstance();
  await db
    .update(notifications)
    .set({ is_read: true, read_at: new Date() })
    .where(and(eq(notifications.id, notificationId), eq(notifications.user_id, userId)));
}

export async function markAllAsRead(userId: string): Promise<void> {
  const db = getDrizzleInstance();
  await db
    .update(notifications)
    .set({ is_read: true, read_at: new Date() })
    .where(and(eq(notifications.user_id, userId), eq(notifications.is_read, false)));
}

export async function dismissNotification(notificationId: string, userId: string): Promise<void> {
  const db = getDrizzleInstance();
  await db
    .delete(notifications)
    .where(and(eq(notifications.id, notificationId), eq(notifications.user_id, userId)));
}

export async function dismissAllNotifications(userId: string): Promise<void> {
  const db = getDrizzleInstance();
  await db.delete(notifications).where(eq(notifications.user_id, userId));
}

export async function deleteOldNotifications(daysOld: number = 90): Promise<number> {
  const db = getDrizzleInstance();

  const rows = await db
    .delete(notifications)
    .where(lt(notifications.created_at, sql`CURRENT_TIMESTAMP - make_interval(days => ${daysOld})`))
    .returning({ id: notifications.id });

  return rows.length;
}

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { createLogger } from '../../utils/logger.js';

import { publishNotification } from './notificationPubSub.js';

import type { Notification, CreateNotificationParams, NotificationListOptions } from './types.js';

const log = createLogger('NotificationService');

const db = getPostgresInstance();

export async function createNotification(params: CreateNotificationParams): Promise<Notification> {
  const { userId, type, title, body, metadata = {}, actionUrl, groupKey } = params;

  const rows = (await db.query(
    `INSERT INTO notifications (user_id, type, title, body, metadata, action_url, group_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      userId,
      type,
      title,
      body || null,
      JSON.stringify(metadata),
      actionUrl || null,
      groupKey || null,
    ]
  )) as unknown as Notification[];

  const notification = rows[0];

  publishNotification(userId, notification).catch((err) => {
    log.warn('Failed to publish notification via Redis', { userId, error: err.message });
  });

  return notification;
}

export async function getNotificationsForUser(
  userId: string,
  options: NotificationListOptions = {}
): Promise<Notification[]> {
  const { limit = 20, offset = 0, unreadOnly = false } = options;

  const whereClause = unreadOnly ? 'WHERE user_id = $1 AND is_read = FALSE' : 'WHERE user_id = $1';

  return (await db.query(
    `SELECT * FROM notifications ${whereClause} ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  )) as unknown as Notification[];
}

export async function getUnreadCount(userId: string): Promise<number> {
  const rows = (await db.query(
    'SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = FALSE',
    [userId]
  )) as unknown as Array<{ count: number }>;

  return rows[0]?.count ?? 0;
}

export async function markAsRead(notificationId: string, userId: string): Promise<void> {
  await db.query(
    'UPDATE notifications SET is_read = TRUE, read_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2',
    [notificationId, userId]
  );
}

export async function markAllAsRead(userId: string): Promise<void> {
  await db.query(
    'UPDATE notifications SET is_read = TRUE, read_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND is_read = FALSE',
    [userId]
  );
}

export async function deleteOldNotifications(daysOld: number = 90): Promise<number> {
  const rows = (await db.query(
    `DELETE FROM notifications WHERE created_at < CURRENT_TIMESTAMP - make_interval(days => $1) RETURNING id`,
    [daysOld]
  )) as unknown as Array<{ id: string }>;

  return rows.length;
}

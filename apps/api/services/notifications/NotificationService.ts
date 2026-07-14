import { and, count, eq, lt, sql, type InferSelectModel } from 'drizzle-orm';

import { group_memberships, notifications } from '../../database/schema/index.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import {
  sendBoardNotificationEmail,
  sendDocumentNotificationEmail,
  sendNotificationEmail,
} from '../../services/email/index.js';
import { sendPushToUser } from '../../services/pushNotificationService.js';
import { createLogger } from '../../utils/logger.js';

import { shouldDeliver, getProfileForDelivery } from './notificationPreferences.js';
import { publishNotification } from './notificationPubSub.js';

import type {
  Notification,
  CreateNotificationParams,
  NotificationChannel,
  NotificationListOptions,
  NotificationType,
} from './types.js';
import type { UserProfile } from '../user/types.js';

// Types that have a dedicated, richer email template fired at the call site
// (e.g. permissionsController → sendDocumentShareEmail). The central
// dispatcher must skip these to avoid double-sending.
const EMAIL_HANDLED_ELSEWHERE: ReadonlySet<NotificationType> = new Set<NotificationType>([
  'document_shared',
]);

// Types delivered exclusively in-app (no push, no email) regardless of importance
// tier — e.g. one-off product announcements where a mass email/push is unwanted.
const IN_APP_ONLY: ReadonlySet<NotificationType> = new Set<NotificationType>(['new_avatars']);

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
  }).catch((err: unknown) => {
    log.warn('Failed to send push notification', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

/** Read a non-empty string field from notification metadata, else null. */
function metaStr(metadata: Record<string, unknown>, key: string): string | null {
  const v = metadata[key];
  return typeof v === 'string' && v ? v : null;
}

/** Read a string-array field from notification metadata, else []. */
function metaStrArray(metadata: Record<string, unknown>, key: string): string[] {
  const v = metadata[key];
  return Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : [];
}

function fireEmail(
  userId: string,
  profile: UserProfile | null,
  title: string,
  body: string | null,
  type: NotificationType,
  actionUrl: string | null | undefined,
  metadata: Record<string, unknown>
) {
  const recipientEmail = profile?.email;
  if (!recipientEmail) {
    log.warn('[NotificationService] Email channel enabled but profile has no email', {
      userId,
      type,
    });
    return;
  }

  const recipientName = profile?.display_name ?? null;
  const onError = (err: unknown) => {
    log.warn('Failed to send notification email', {
      userId,
      type,
      error: err instanceof Error ? err.message : String(err),
    });
  };

  // Board notifications: render the rich card-preview email when the firing site
  // enriched metadata with a card snapshot; otherwise fall back to generic.
  const cardTitle = metaStr(metadata, 'cardTitle');
  const eventText = metaStr(metadata, 'eventText');
  if (type.startsWith('board_') && (cardTitle || eventText)) {
    sendBoardNotificationEmail({
      recipientEmail,
      ...(recipientName != null && { recipientName }),
      title,
      actionUrl: actionUrl ?? null,
      fields: {
        cardTitle,
        boardTitle: metaStr(metadata, 'boardTitle'),
        descriptionSnippet: metaStr(metadata, 'descriptionSnippet'),
        statusLabel: metaStr(metadata, 'statusLabel'),
        statusColor: metaStr(metadata, 'statusColor'),
        dueDate: metaStr(metadata, 'dueDate'),
        assigneeNames: metaStrArray(metadata, 'assigneeNames'),
        labelNames: metaStrArray(metadata, 'labelNames'),
        eventText,
      },
    }).catch(onError);
    return;
  }

  // Document notifications (permission changed / revoked / group share): rich
  // preview email when the firing site supplied a doc title/preview.
  const docTitle = metaStr(metadata, 'docTitle');
  const docPreview = metaStr(metadata, 'docPreview');
  if (
    (type.startsWith('document_') || type === 'group_content_shared') &&
    (docTitle || docPreview)
  ) {
    sendDocumentNotificationEmail({
      recipientEmail,
      ...(recipientName != null && { recipientName }),
      title,
      actionUrl: actionUrl ?? null,
      fields: {
        body,
        docTitle,
        actorName: metaStr(metadata, 'actorName'),
        permissionLabel: metaStr(metadata, 'permissionLabel'),
        previewSnippet: docPreview,
      },
    }).catch(onError);
    return;
  }

  sendNotificationEmail({
    recipientEmail,
    ...(recipientName != null && { recipientName }),
    title,
    body,
    actionUrl: actionUrl ?? null,
  }).catch(onError);
}

/**
 * Resolve the group a notification belongs to, if any. Group notifications
 * carry the id in `metadata.groupId` (and mirror it in `groupKey` as
 * `group:<id>`); non-group notifications have neither.
 */
function resolveGroupId(
  metadata: Record<string, unknown>,
  groupKey: string | undefined
): string | null {
  if (typeof metadata.groupId === 'string' && metadata.groupId) return metadata.groupId;
  if (groupKey?.startsWith('group:')) return groupKey.slice('group:'.length) || null;
  return null;
}

/**
 * Whether the user has muted notifications for this group (via the group's
 * 3-dot menu). Fail-open: any error resolves to `false` so notifications are
 * never silently suppressed by an infra hiccup.
 */
async function isGroupMutedForUser(userId: string, groupId: string): Promise<boolean> {
  try {
    const db = getDrizzleInstance();
    const rows = await db
      .select({ muted: group_memberships.notifications_muted })
      .from(group_memberships)
      .where(and(eq(group_memberships.group_id, groupId), eq(group_memberships.user_id, userId)))
      .limit(1);
    return rows[0]?.muted === true;
  } catch (err) {
    log.warn('Failed to check group mute preference', {
      userId,
      groupId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

export async function createNotification(
  params: CreateNotificationParams
): Promise<NotificationRow | null> {
  const { userId, type, title, body, metadata = {}, actionUrl, groupKey, channelOverride } = params;

  const profile = await getProfileForDelivery(userId);

  // A muted group suppresses the noisy channels (email + push) for this user;
  // the in-app notification is still recorded so nothing is lost.
  const groupId = resolveGroupId(metadata, groupKey);
  const groupMuted = groupId ? await isGroupMutedForUser(userId, groupId) : false;

  // A per-call override wins over the user's stored channel preference.
  const wants = async (channel: NotificationChannel): Promise<boolean> =>
    channelOverride?.[channel] ?? (await shouldDeliver(userId, type, channel, profile));

  const showInApp = await wants('in_app');
  const sendEmailChannel =
    !groupMuted &&
    !EMAIL_HANDLED_ELSEWHERE.has(type) &&
    !IN_APP_ONLY.has(type) &&
    (await wants('email'));
  const sendPush = !groupMuted && !IN_APP_ONLY.has(type) && (await wants('push'));

  // Nothing to deliver on any channel — skip entirely.
  if (!showInApp && !sendEmailChannel && !sendPush) {
    return null;
  }

  // The in-system notification is the durable record and the floor: it is always
  // inserted whenever the notification is delivered on ANY channel, so email/push can
  // never fire without a matching in-system entry ("nothing is lost").
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

  if (sendPush) firePush(userId, title, body ?? null, type, actionUrl, notification.id);
  if (sendEmailChannel) fireEmail(userId, profile, title, body ?? null, type, actionUrl, metadata);

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

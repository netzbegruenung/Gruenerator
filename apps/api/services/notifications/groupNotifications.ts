import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { createLogger } from '../../utils/logger.js';

import { createNotification } from './NotificationService.js';

import type { NotificationType } from './types.js';

const log = createLogger('GroupNotifications');

interface NotifyGroupParams {
  groupId: string;
  excludeUserId: string;
  type: NotificationType;
  title: string;
  body: string;
  actionUrl: string;
  metadata?: Record<string, unknown>;
}

export async function notifyGroupMembers(params: NotifyGroupParams): Promise<void> {
  const { groupId, excludeUserId, type, title, body, actionUrl, metadata } = params;

  try {
    const db = getPostgresInstance();

    const [members, group] = await Promise.all([
      db.query(
        'SELECT user_id FROM group_memberships WHERE group_id = $1 AND user_id != $2 AND is_active = TRUE',
        [groupId, excludeUserId]
      ) as Promise<Array<{ user_id: string }>>,
      db.queryOne('SELECT name FROM groups WHERE id = $1', [groupId], {
        table: 'groups',
      }) as Promise<{ name: string } | null>,
    ]);

    if (!members || members.length === 0) return;

    const groupName = group?.name || 'Gruppe';

    await Promise.all(
      members.map((m) =>
        createNotification({
          userId: m.user_id,
          type,
          title,
          body,
          actionUrl,
          metadata: { groupId, groupName, ...metadata },
          groupKey: `group:${groupId}`,
        }).catch((err: unknown) => {
          log.warn('Failed to notify group member', {
            userId: m.user_id,
            groupId,
            error: err instanceof Error ? err.message : String(err),
          });
        })
      )
    );
  } catch (err) {
    log.warn('Failed to notify group members', { groupId, error: (err as Error).message });
  }
}

/**
 * Notify a group's admins (membership role='admin' plus the creator), excluding
 * one user. Used to surface pending join requests to the people who can act on
 * them.
 */
export async function notifyGroupAdmins(params: NotifyGroupParams): Promise<void> {
  const { groupId, excludeUserId, type, title, body, actionUrl, metadata } = params;

  try {
    const db = getPostgresInstance();

    const admins = (await db.query(
      `SELECT DISTINCT user_id FROM (
         SELECT user_id FROM group_memberships
           WHERE group_id = $1 AND role = 'admin' AND is_active = TRUE
         UNION
         SELECT created_by AS user_id FROM groups WHERE id = $1 AND created_by IS NOT NULL
       ) admins
       WHERE user_id != $2`,
      [groupId, excludeUserId]
    )) as Array<{ user_id: string }>;

    if (!admins || admins.length === 0) return;

    const group = (await db.queryOne('SELECT name FROM groups WHERE id = $1', [groupId], {
      table: 'groups',
    })) as { name: string } | null;
    const groupName = group?.name || 'Gruppe';

    await Promise.all(
      admins.map((a) =>
        createNotification({
          userId: a.user_id,
          type,
          title,
          body,
          actionUrl,
          metadata: { groupId, groupName, ...metadata },
          groupKey: `group:${groupId}`,
        }).catch((err: unknown) => {
          log.warn('Failed to notify group admin', {
            userId: a.user_id,
            groupId,
            error: err instanceof Error ? err.message : String(err),
          });
        })
      )
    );
  } catch (err) {
    log.warn('Failed to notify group admins', { groupId, error: (err as Error).message });
  }
}

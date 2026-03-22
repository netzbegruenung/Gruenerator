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
      db.query('SELECT user_id FROM group_memberships WHERE group_id = $1 AND user_id != $2', [
        groupId,
        excludeUserId,
      ]) as Promise<Array<{ user_id: string }>>,
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
        }).catch((err) => {
          log.warn('Failed to notify group member', {
            userId: m.user_id,
            groupId,
            error: err.message,
          });
        })
      )
    );
  } catch (err) {
    log.warn('Failed to notify group members', { groupId, error: (err as Error).message });
  }
}

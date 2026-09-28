import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { createLogger } from '../../utils/logger.js';

import { createNotification } from './NotificationService.js';

import type { NotificationType } from './types.js';

const log = createLogger('GroupNotifications');

interface GroupRow {
  name: string;
  is_system: boolean | null;
}

// The system group holds every user: deliver in slices so one share doesn't
// queue thousands of inserts on the pool at once.
const DELIVER_CHUNK = 200;

// Addressed to one person: shown on their own instead of folded into the
// group's bundle in the bell, where only the newest line is clickable.
const UNGROUPED_TYPES: ReadonlySet<NotificationType> = new Set([
  'group_user_mentioned',
  'group_mention_all',
]);

interface NotifyGroupParams {
  groupId: string;
  excludeUserId: string;
  /** Further users to leave out — e.g. those already reached by a mention. */
  skipUserIds?: string[];
  type: NotificationType;
  title: string;
  body: string;
  actionUrl: string;
  metadata?: Record<string, unknown>;
}

export async function notifyGroupMembers(params: NotifyGroupParams): Promise<void> {
  const { groupId, excludeUserId, skipUserIds = [] } = params;

  try {
    const db = getPostgresInstance();

    const [members, group] = await Promise.all([
      db.query(
        `SELECT user_id FROM group_memberships
          WHERE group_id = $1 AND user_id != $2 AND user_id <> ALL($3::uuid[]) AND is_active = TRUE`,
        [groupId, excludeUserId, skipUserIds]
      ) as Promise<Array<{ user_id: string }>>,
      db.queryOne('SELECT name, is_system FROM groups WHERE id = $1', [groupId], {
        table: 'groups',
      }) as Promise<GroupRow | null>,
    ]);

    if (!members || members.length === 0) return;

    await deliver(
      members.map((m) => m.user_id),
      group,
      params
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
  const { groupId, excludeUserId } = params;

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

    const group = (await db.queryOne(
      'SELECT name, is_system FROM groups WHERE id = $1',
      [groupId],
      {
        table: 'groups',
      }
    )) as GroupRow | null;

    await deliver(
      admins.map((a) => a.user_id),
      group,
      params
    );
  } catch (err) {
    log.warn('Failed to notify group admins', { groupId, error: (err as Error).message });
  }
}

/**
 * Notify specific users of a group (e.g. the sharer and earlier commenters of
 * a feed post), excluding one user and anyone who is no longer an active member.
 */
export async function notifyGroupUsers(
  params: NotifyGroupParams & { userIds: string[] }
): Promise<void> {
  const { groupId, excludeUserId, userIds, skipUserIds = [] } = params;
  const candidates = [...new Set(userIds)].filter(
    (id) => id !== excludeUserId && !skipUserIds.includes(id)
  );
  if (candidates.length === 0) return;

  try {
    const db = getPostgresInstance();
    const [members, group] = await Promise.all([
      db.query(
        'SELECT user_id FROM group_memberships WHERE group_id = $1 AND user_id = ANY($2::uuid[]) AND is_active = TRUE',
        [groupId, candidates]
      ) as Promise<Array<{ user_id: string }>>,
      db.queryOne('SELECT name, is_system FROM groups WHERE id = $1', [groupId], {
        table: 'groups',
      }) as Promise<GroupRow | null>,
    ]);
    if (!members || members.length === 0) return;

    await deliver(
      members.map((m) => m.user_id),
      group,
      params
    );
  } catch (err) {
    log.warn('Failed to notify group users', { groupId, error: (err as Error).message });
  }
}

async function deliver(
  userIds: string[],
  group: GroupRow | null,
  params: NotifyGroupParams
): Promise<void> {
  const { groupId, type, title, body, actionUrl, metadata } = params;
  const groupName = group?.name || 'Gruppe';
  // In the system group notifications stay in-app — no mass email to every user.
  const channelOverride = group?.is_system ? { email: false } : undefined;
  for (let i = 0; i < userIds.length; i += DELIVER_CHUNK) {
    await Promise.all(
      userIds.slice(i, i + DELIVER_CHUNK).map((userId) =>
        createNotification({
          userId,
          type,
          title,
          body,
          actionUrl,
          metadata: { groupId, groupName, ...metadata },
          ...(UNGROUPED_TYPES.has(type) ? {} : { groupKey: `group:${groupId}` }),
          channelOverride,
        }).catch((err: unknown) => {
          log.warn('Failed to notify group user', {
            userId,
            groupId,
            error: err instanceof Error ? err.message : String(err),
          });
        })
      )
    );
  }
}

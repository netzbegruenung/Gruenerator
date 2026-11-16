import { buildChatThreadSlug } from '@gruenerator/shared/utils';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { createLogger } from '../../utils/logger.js';
import { teamChatShareExistsSql } from '../groups/projectThreadScope.js';

import { createNotificationsForUsers } from './NotificationService.js';

const log = createLogger('GroupChatNotifications');

interface TeamChatParams {
  threadId: string;
  senderId: string;
  senderName: string;
  threadTitle: string;
}

interface ParticipantRow {
  user_id: string;
  group_id: string;
  slug_suffix: string | null;
}

/**
 * Tell the other participants of a team chat (owner + everyone who has written
 * in it, still active members of the project) that someone wrote. One bundle
 * per thread via `group_key`. A private thread (no read+write group share)
 * yields no rows and therefore no notification. Never throws.
 */
export async function notifyTeamChatParticipants(params: TeamChatParams): Promise<void> {
  const { threadId, senderId, senderName, threadTitle } = params;
  try {
    const rows = (await getPostgresInstance().query(
      `SELECT DISTINCT r.user_id, t.group_id::text AS group_id, t.slug_suffix
         FROM chat_threads t
         JOIN groups g ON g.id = t.group_id AND g.deleted_at IS NULL
          AND COALESCE(g.is_active, TRUE) = TRUE
         JOIN LATERAL (
              SELECT t.user_id::text AS user_id
              UNION
              SELECT cm.user_id::text FROM chat_messages cm
               WHERE cm.thread_id = t.id AND cm.user_id IS NOT NULL
         ) r ON TRUE
         JOIN group_memberships gm ON gm.group_id = g.id AND gm.user_id::text = r.user_id
          AND gm.is_active = TRUE
        WHERE t.id = $1::uuid AND t.deleted_at IS NULL
          AND r.user_id <> $2::text
          AND ${teamChatShareExistsSql('t', 'g.id')}`,
      [threadId, senderId]
    )) as ParticipantRow[];

    if (!rows || rows.length === 0) return;

    const first = rows[0]!;
    await createNotificationsForUsers(
      rows.map((r) => r.user_id),
      {
        type: 'group_chat_message',
        title: `${senderName} im Chat „${threadTitle}“`,
        actionUrl: first.slug_suffix
          ? `/chat/${buildChatThreadSlug(threadTitle, first.slug_suffix)}`
          : `/chat/${threadId}`,
        groupKey: `group-chat:${threadId}`,
        metadata: { groupId: first.group_id, threadId },
      }
    );
  } catch (err) {
    log.warn('Failed to notify team chat participants', {
      threadId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Resolves sender name and thread title, then notifies. Never throws. */
export async function notifyTeamChatTurn(params: {
  threadId: string;
  senderId: string;
}): Promise<void> {
  const { threadId, senderId } = params;
  try {
    const db = getPostgresInstance();
    const [sender, thread] = (await Promise.all([
      db.queryOne('SELECT display_name FROM profiles WHERE id = $1::uuid', [senderId], {
        table: 'profiles',
      }),
      db.queryOne(
        'SELECT title FROM chat_threads WHERE id = $1::uuid AND deleted_at IS NULL',
        [threadId],
        { table: 'chat_threads' }
      ),
    ])) as [{ display_name: string | null } | null, { title: string | null } | null];
    await notifyTeamChatParticipants({
      threadId,
      senderId,
      senderName: sender?.display_name?.trim() || 'Jemand',
      threadTitle: thread?.title?.trim() || 'Neuer Chat',
    });
  } catch (err) {
    log.warn('Failed to resolve team chat notification context', {
      threadId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

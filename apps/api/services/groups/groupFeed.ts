/**
 * Gruppen-Feed: eine Zeile in `group_content_shares` ist ein Beitrag. Hier
 * leben Anheften, Notiz ändern und der flache Kommentar-Thread je Beitrag.
 *
 * Rechte:
 * - Anheften/Lösen: Admins (Rolle `admin` oder Ersteller*in). Mehr als
 *   `GROUP_PIN_LIMIT` Anheftungen verdrängen die älteste.
 * - Notiz ändern: wer geteilt hat, oder Admins.
 * - Kommentieren: alle Mitglieder, nicht in Projekten (`group_type='personal'`).
 * - Kommentar löschen: wer ihn geschrieben hat, oder Admins.
 *
 * Nichtmitglieder bekommen einen Wurf mit der Meldung von
 * `getPostgresAndCheckMembership`; der Handler macht daraus ein 403.
 */
import { GROUP_PIN_LIMIT, type GroupShareComment } from '@gruenerator/contracts';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { notifyGroupUsers } from '../notifications/index.js';

import type { PostgresService } from '../../database/services/PostgresService.js';

export interface GroupFeedDeps {
  postgres: Pick<PostgresService, 'query' | 'queryOne' | 'exec'>;
  notify: typeof notifyGroupUsers;
}

function defaultDeps(): GroupFeedDeps {
  return { postgres: getPostgresInstance(), notify: notifyGroupUsers };
}

export type FeedOutcome<T = null> =
  { status: 200 | 201; data: T } | { status: 400 | 403 | 404; message: string };

interface Viewer {
  isAdmin: boolean;
  isPersonal: boolean;
}

async function getViewer(
  postgres: GroupFeedDeps['postgres'],
  groupId: string,
  userId: string
): Promise<Viewer> {
  const row = (await postgres.queryOne(
    `SELECT gm.role, g.group_type, g.created_by
       FROM group_memberships gm
       JOIN groups g ON g.id = gm.group_id
      WHERE gm.group_id = $1 AND gm.user_id = $2`,
    [groupId, userId],
    { table: 'group_memberships' }
  )) as { role: string; group_type: string | null; created_by: string | null } | null;
  if (!row) throw new Error('Du bist nicht Mitglied dieser Gruppe.');
  return {
    isAdmin: row.role === 'admin' || row.created_by === userId,
    isPersonal: row.group_type === 'personal',
  };
}

interface ShareRow {
  id: string;
  shared_by_user_id: string | null;
}

async function getShare(
  postgres: GroupFeedDeps['postgres'],
  groupId: string,
  shareId: string
): Promise<ShareRow | null> {
  return (await postgres.queryOne(
    'SELECT id, shared_by_user_id FROM group_content_shares WHERE id = $1 AND group_id = $2',
    [shareId, groupId],
    { table: 'group_content_shares' }
  )) as ShareRow | null;
}

const SHARE_NOT_FOUND = { status: 404 as const, message: 'Beitrag nicht gefunden.' };

export async function updateGroupShare(
  input: {
    groupId: string;
    shareId: string;
    userId: string;
    pinned: boolean | null;
    note: string | null;
  },
  deps: GroupFeedDeps = defaultDeps()
): Promise<FeedOutcome> {
  const { groupId, shareId, userId, pinned, note } = input;
  const { postgres } = deps;
  const viewer = await getViewer(postgres, groupId, userId);
  const share = await getShare(postgres, groupId, shareId);
  if (!share) return SHARE_NOT_FOUND;

  if (pinned != null && !viewer.isAdmin) {
    return { status: 403, message: 'Nur Admins können Beiträge anheften.' };
  }
  if (note != null && !viewer.isAdmin && share.shared_by_user_id !== userId) {
    return { status: 403, message: 'Nur wer geteilt hat, kann die Notiz ändern.' };
  }

  if (note != null) {
    await postgres.exec('UPDATE group_content_shares SET note = $1 WHERE id = $2', [
      note.trim() || null,
      shareId,
    ]);
  }

  if (pinned === true) {
    await postgres.exec(
      `UPDATE group_content_shares SET pinned_at = CURRENT_TIMESTAMP, pinned_by = $1
        WHERE id = $2 AND pinned_at IS NULL`,
      [userId, shareId]
    );
    await postgres.exec(
      `UPDATE group_content_shares SET pinned_at = NULL, pinned_by = NULL
        WHERE id IN (
          SELECT id FROM group_content_shares
           WHERE group_id = $1 AND pinned_at IS NOT NULL
           ORDER BY pinned_at DESC
           OFFSET $2
        )`,
      [groupId, GROUP_PIN_LIMIT]
    );
  } else if (pinned === false) {
    await postgres.exec(
      'UPDATE group_content_shares SET pinned_at = NULL, pinned_by = NULL WHERE id = $1',
      [shareId]
    );
  }

  return { status: 200, data: null };
}

interface CommentRow {
  id: string;
  share_id: string;
  user_id: string | null;
  body: string;
  created_at: string | Date;
  author_name: string | null;
}

function toComment(r: CommentRow): GroupShareComment {
  return {
    id: r.id,
    shareId: r.share_id,
    userId: r.user_id,
    authorName: r.author_name || 'Ehemaliges Mitglied',
    body: r.body,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

export async function listShareComments(
  input: { groupId: string; shareId: string; userId: string },
  deps: GroupFeedDeps = defaultDeps()
): Promise<FeedOutcome<GroupShareComment[]>> {
  const { groupId, shareId, userId } = input;
  const { postgres } = deps;
  await getViewer(postgres, groupId, userId);
  if (!(await getShare(postgres, groupId, shareId))) return SHARE_NOT_FOUND;

  const rows = (await postgres.query(
    `SELECT c.id, c.share_id, c.user_id, c.body, c.created_at,
            COALESCE(p.display_name, p.first_name) AS author_name
       FROM group_share_comments c
       LEFT JOIN profiles p ON p.id = c.user_id
      WHERE c.share_id = $1 AND c.group_id = $2
      ORDER BY c.created_at ASC`,
    [shareId, groupId],
    { table: 'group_share_comments' }
  )) as CommentRow[];
  return { status: 200, data: rows.map(toComment) };
}

export async function createShareComment(
  input: { groupId: string; shareId: string; userId: string; body: string; authorName: string },
  deps: GroupFeedDeps = defaultDeps()
): Promise<FeedOutcome<GroupShareComment>> {
  const { groupId, shareId, userId, authorName } = input;
  const body = input.body.trim();
  const { postgres } = deps;
  const viewer = await getViewer(postgres, groupId, userId);
  if (viewer.isPersonal) {
    return { status: 400, message: 'In Projekten gibt es keine Kommentare.' };
  }
  const share = await getShare(postgres, groupId, shareId);
  if (!share) return SHARE_NOT_FOUND;
  if (!body) return { status: 400, message: 'Kommentar ist leer.' };

  const row = (await postgres.queryOne(
    `INSERT INTO group_share_comments (share_id, group_id, user_id, body)
     VALUES ($1, $2, $3, $4)
     RETURNING id, share_id, user_id, body, created_at`,
    [shareId, groupId, userId, body],
    { table: 'group_share_comments' }
  )) as Omit<CommentRow, 'author_name'> | null;
  if (!row) throw new Error('Kommentar konnte nicht gespeichert werden.');

  const earlier = (await postgres.query(
    'SELECT DISTINCT user_id FROM group_share_comments WHERE share_id = $1 AND user_id IS NOT NULL',
    [shareId],
    { table: 'group_share_comments' }
  )) as Array<{ user_id: string }>;
  const recipients = [
    ...(share.shared_by_user_id ? [share.shared_by_user_id] : []),
    ...earlier.map((r) => r.user_id),
  ];
  void deps.notify({
    groupId,
    excludeUserId: userId,
    userIds: recipients,
    type: 'group_comment_added',
    title: 'Neuer Kommentar',
    body: `${authorName}: ${body.length > 140 ? `${body.slice(0, 140)}…` : body}`,
    actionUrl: `/projekte/${groupId}?beitrag=${shareId}`,
    metadata: { shareId },
  });

  return { status: 201, data: toComment({ ...row, author_name: authorName }) };
}

export async function deleteShareComment(
  input: { groupId: string; shareId: string; commentId: string; userId: string },
  deps: GroupFeedDeps = defaultDeps()
): Promise<FeedOutcome> {
  const { groupId, shareId, commentId, userId } = input;
  const { postgres } = deps;
  const viewer = await getViewer(postgres, groupId, userId);
  const comment = (await postgres.queryOne(
    'SELECT user_id FROM group_share_comments WHERE id = $1 AND share_id = $2 AND group_id = $3',
    [commentId, shareId, groupId],
    { table: 'group_share_comments' }
  )) as { user_id: string | null } | null;
  if (!comment) return { status: 404, message: 'Kommentar nicht gefunden.' };
  if (!viewer.isAdmin && comment.user_id !== userId) {
    return { status: 403, message: 'Du kannst nur eigene Kommentare löschen.' };
  }
  await postgres.exec('DELETE FROM group_share_comments WHERE id = $1', [commentId]);
  return { status: 200, data: null };
}

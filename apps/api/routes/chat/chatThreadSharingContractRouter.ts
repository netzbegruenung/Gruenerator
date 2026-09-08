/**
 * ts-rest contract router for chat thread sharing.
 *
 * Group shares (Mitarbeiten / Nur lesen), the authenticated link share,
 * resolving a shared thread for the read-only archive view, and forking a
 * shared thread into an own copy. Mounted in routes.ts via
 * mountChatThreadSharingContractRouter(app) behind the requireAuth guard on
 * /api/chat-service/threads.
 *
 * Supersedes the legacy plain-Express threadSharingController, which stays
 * mounted on its old paths (/:id/groups, /user-groups) for shipped mobile
 * binaries.
 */

import { chatThreadSharingContract } from '@gruenerator/contracts';
import { extractSlugSuffix } from '@gruenerator/shared/utils';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';
import { toIsoString } from '../../utils/toIsoString.js';
import { ThreadId, UserId } from '../../utils/types/branded.js';

import { getThreadAccessLevel } from './services/threadAccessService.js';
import { insertThreadWithSlugRetry } from './services/threadPersistenceService.js';

import type { UserProfile } from '../../services/user/types.js';
import type { Application, Request } from 'express';

const log = createLogger('chatThreadSharingContractRouter');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getUserId(req: Request): string {
  const user = req.user as UserProfile | undefined;
  if (!user?.id) {
    // requireAuth is mounted ahead of this router in routes.ts; seeing this
    // log means something bypassed it.
    log.error(
      '[chatThreadSharing] getUserId called with undefined req.user — middleware bypassed? url=%s',
      req.originalUrl
    );
    throw new Error('Authentication required (req.user undefined)');
  }
  return user.id;
}

/** Owner check shared by every share-management handler.
 *  Returns 'missing' | 'forbidden' | 'ok'. */
async function checkOwnership(
  threadId: string,
  userId: string
): Promise<'missing' | 'forbidden' | 'ok'> {
  const db = getPostgresInstance();
  const rows = await db.query(`SELECT user_id FROM chat_threads WHERE id = $1`, [threadId]);
  if (rows.length === 0) return 'missing';
  return String(rows[0]?.user_id) === userId ? 'ok' : 'forbidden';
}

const s = initServer();

export const chatThreadSharingContractRouter = s.router(chatThreadSharingContract, {
  resolveShared: async (args) => {
    try {
      const userId = getUserId(args.req);
      const { slugOrId } = args.params;
      const db = getPostgresInstance();

      // UUID → direct id; otherwise a Notion-style slug whose 6-char suffix
      // is the stable lookup key (the name prefix is cosmetic).
      let threadId: string | null = null;
      if (UUID_RE.test(slugOrId)) {
        threadId = slugOrId;
      } else {
        const suffix = extractSlugSuffix(slugOrId);
        if (suffix) {
          const rows = await db.query(`SELECT id FROM chat_threads WHERE slug_suffix = $1`, [
            suffix,
          ]);
          threadId = rows.length > 0 ? String(rows[0]?.id) : null;
        }
      }
      if (!threadId) {
        return { status: 404 as const, body: { error: 'Thread not found' } };
      }

      const level = await getThreadAccessLevel(ThreadId(threadId), UserId(userId));
      // 404, never 403 — existence is not confirmed to callers without access.
      if (level === 'none') {
        return { status: 404 as const, body: { error: 'Thread not found' } };
      }

      const rows = await db.query(
        `SELECT t.id, t.slug_suffix, t.title, t.agent_id, t.created_at, t.updated_at,
                COALESCE(t.share_mode, 'private') AS share_mode,
                p.display_name AS owner_name
         FROM chat_threads t
         LEFT JOIN profiles p ON p.id = t.user_id
         WHERE t.id = $1`,
        [threadId]
      );
      const row = rows[0];
      if (!row) {
        return { status: 404 as const, body: { error: 'Thread not found' } };
      }

      return {
        status: 200 as const,
        body: {
          id: String(row.id),
          slugSuffix: (row.slug_suffix as string) ?? null,
          title: (row.title as string) ?? null,
          ownerName: (row.owner_name as string) ?? null,
          accessLevel: level,
          shareMode:
            row.share_mode === 'authenticated' ? ('authenticated' as const) : ('private' as const),
          agentId: String(row.agent_id),
          createdAt: toIsoString(row.created_at as Date | string),
          updatedAt: toIsoString(row.updated_at as Date | string),
        },
      };
    } catch (error) {
      log.error('Error resolving shared thread:', error);
      return { status: 500 as const, body: { error: 'Failed to resolve shared thread' } };
    }
  },

  listUserGroups: async (args) => {
    try {
      const userId = getUserId(args.req);
      const db = getPostgresInstance();
      const groups = await db.query(
        `SELECT g.id, g.name, gm.role
         FROM groups g
         INNER JOIN group_memberships gm ON gm.group_id = g.id
         WHERE gm.user_id = $1 AND gm.is_active = TRUE
         ORDER BY g.name ASC`,
        [userId]
      );
      return {
        status: 200 as const,
        body: groups.map((g) => ({
          id: String(g.id),
          name: String(g.name),
          role: String(g.role ?? 'member'),
        })),
      };
    } catch (error) {
      log.error('Error fetching user groups:', error);
      return { status: 500 as const, body: { error: 'Failed to fetch groups' } };
    }
  },

  listGroupShares: async (args) => {
    try {
      const userId = getUserId(args.req);
      const { threadId } = args.params;

      const ownership = await checkOwnership(threadId, userId);
      if (ownership === 'missing')
        return { status: 404 as const, body: { error: 'Thread not found' } };
      if (ownership === 'forbidden')
        return { status: 403 as const, body: { error: 'Only thread owner can manage sharing' } };

      const db = getPostgresInstance();
      const shares = await db.query(
        `SELECT gcs.group_id, g.name AS group_name, gcs.shared_at,
                COALESCE((gcs.permissions->>'write')::boolean, true) AS can_write
         FROM group_content_shares gcs
         INNER JOIN groups g ON g.id = gcs.group_id
         WHERE gcs.content_type = 'chat_threads' AND gcs.content_id = $1
         ORDER BY gcs.shared_at DESC`,
        [threadId]
      );
      return {
        status: 200 as const,
        body: shares.map((sRow) => ({
          groupId: String(sRow.group_id),
          groupName: String(sRow.group_name),
          mode: sRow.can_write === false ? ('read' as const) : ('write' as const),
          sharedAt: toIsoString(sRow.shared_at as Date | string),
        })),
      };
    } catch (error) {
      log.error('Error fetching thread shares:', error);
      return { status: 500 as const, body: { error: 'Failed to fetch thread shares' } };
    }
  },

  shareWithGroup: async (args) => {
    try {
      const userId = getUserId(args.req);
      const { threadId } = args.params;
      const { groupId, mode } = args.body;

      const ownership = await checkOwnership(threadId, userId);
      if (ownership === 'missing')
        return { status: 404 as const, body: { error: 'Thread not found' } };
      if (ownership === 'forbidden')
        return { status: 403 as const, body: { error: 'Only thread owner can share' } };

      const db = getPostgresInstance();
      const membership = await db.query(
        `SELECT 1 FROM group_memberships WHERE group_id = $1 AND user_id = $2 AND is_active = TRUE`,
        [groupId, userId]
      );
      if (membership.length === 0) {
        return { status: 403 as const, body: { error: 'You must be a member of the group' } };
      }

      // Upsert without a unique constraint (group_content_shares has none on
      // (content_type, content_id, group_id) — only a non-unique index):
      // UPDATE first, INSERT when nothing matched. The dialog is owner-only,
      // so the race window is acceptable.
      const canWrite = mode === 'write';
      const updated = await db.query(
        `UPDATE group_content_shares
         SET permissions = jsonb_build_object('read', true, 'write', $3::boolean)
         WHERE content_type = 'chat_threads' AND content_id = $1 AND group_id = $2
         RETURNING id`,
        [threadId, groupId, canWrite]
      );
      if (updated.length === 0) {
        await db.query(
          `INSERT INTO group_content_shares (content_type, content_id, group_id, shared_by_user_id, permissions)
           VALUES ('chat_threads', $1, $2, $3, jsonb_build_object('read', true, 'write', $4::boolean))`,
          [threadId, groupId, userId, canWrite]
        );
      }

      return { status: 200 as const, body: { success: true as const } };
    } catch (error) {
      log.error('Error sharing thread:', error);
      return { status: 500 as const, body: { error: 'Failed to share thread' } };
    }
  },

  unshareGroup: async (args) => {
    try {
      const userId = getUserId(args.req);
      const { threadId, groupId } = args.params;

      const ownership = await checkOwnership(threadId, userId);
      if (ownership === 'missing')
        return { status: 404 as const, body: { error: 'Thread not found' } };
      if (ownership === 'forbidden')
        return { status: 403 as const, body: { error: 'Only thread owner can manage sharing' } };

      const db = getPostgresInstance();
      await db.query(
        `DELETE FROM group_content_shares
         WHERE content_type = 'chat_threads' AND content_id = $1 AND group_id = $2`,
        [threadId, groupId]
      );
      return { status: 200 as const, body: { success: true as const } };
    } catch (error) {
      log.error('Error removing share:', error);
      return { status: 500 as const, body: { error: 'Failed to remove share' } };
    }
  },

  updateShareMode: async (args) => {
    try {
      const userId = getUserId(args.req);
      const { threadId } = args.params;
      const { shareMode } = args.body;

      const ownership = await checkOwnership(threadId, userId);
      if (ownership === 'missing')
        return { status: 404 as const, body: { error: 'Thread not found' } };
      if (ownership === 'forbidden')
        return { status: 403 as const, body: { error: 'Only thread owner can manage sharing' } };

      const db = getPostgresInstance();
      const rows = await db.query(
        `UPDATE chat_threads SET share_mode = $1 WHERE id = $2
         RETURNING share_mode, slug_suffix, title`,
        [shareMode, threadId]
      );
      const row = rows[0];
      if (!row) return { status: 404 as const, body: { error: 'Thread not found' } };

      return {
        status: 200 as const,
        body: {
          shareMode:
            row.share_mode === 'authenticated' ? ('authenticated' as const) : ('private' as const),
          slugSuffix: (row.slug_suffix as string) ?? null,
          title: (row.title as string) ?? null,
        },
      };
    } catch (error) {
      log.error('Error updating share mode:', error);
      return { status: 500 as const, body: { error: 'Failed to update share mode' } };
    }
  },

  fork: async (args) => {
    try {
      const userId = getUserId(args.req);
      const { threadId } = args.params;

      // Read access suffices — owners may fork their own thread too.
      const level = await getThreadAccessLevel(ThreadId(threadId), UserId(userId));
      if (level === 'none') {
        return { status: 404 as const, body: { error: 'Thread not found' } };
      }

      const db = getPostgresInstance();
      const sourceRows = await db.query(
        `SELECT title, agent_id, COALESCE(thread_type, 'chat') AS thread_type
         FROM chat_threads WHERE id = $1`,
        [threadId]
      );
      const source = sourceRows[0];
      if (!source) return { status: 404 as const, body: { error: 'Thread not found' } };

      const title = `Kopie von ${(source.title as string) || 'Chat'}`.slice(0, 255);

      // One atomic statement: thread insert + transcript copy. Copies role,
      // content, tool_calls, tool_results and created_at verbatim (reload
      // rendering — citations, tool cards — reads them); per-message user_id
      // keeps attribution the viewer already saw in the shared view; status
      // is forced to 'complete' (a copied 'streaming' row is just an
      // interrupted turn's text). NOT copied (v1 limitations): attachments
      // (their Qdrant document_ids belong to the source user), the owner's
      // custom_system_prompt/role_ref/custom_enabled_tools, compaction
      // state, tags and the home-space group_id.
      const created = (await insertThreadWithSlugRetry((slugSuffix) =>
        db.query(
          `WITH new_thread AS (
             INSERT INTO chat_threads (user_id, agent_id, title, thread_type, slug_suffix)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, slug_suffix, title
           ), copied AS (
             INSERT INTO chat_messages (thread_id, role, user_id, content, tool_calls, tool_results, status, created_at)
             SELECT nt.id, cm.role, cm.user_id, cm.content, cm.tool_calls, cm.tool_results, 'complete', cm.created_at
             FROM chat_messages cm, new_thread nt
             WHERE cm.thread_id = $6
           )
           SELECT id, slug_suffix, title FROM new_thread`,
          [userId, source.agent_id, title, source.thread_type, slugSuffix, threadId]
        )
      )) as Array<{ id: string; slug_suffix: string | null; title: string | null }>;

      const thread = created[0];
      if (!thread) {
        return { status: 500 as const, body: { error: 'Failed to fork thread' } };
      }

      return {
        status: 200 as const,
        body: {
          threadId: String(thread.id),
          slugSuffix: thread.slug_suffix ?? null,
          title: thread.title ?? null,
        },
      };
    } catch (error) {
      log.error('Error forking thread:', error);
      return { status: 500 as const, body: { error: 'Failed to fork thread' } };
    }
  },
});

export function mountChatThreadSharingContractRouter(app: Application): void {
  createExpressEndpoints(chatThreadSharingContract, chatThreadSharingContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'chatThreadSharingContract'),
  });
}

/**
 * ts-rest contract router for /api/chat-service/threads
 *
 * Wraps the same service calls as threadsController.ts using a
 * contract-driven router from @ts-rest/express.
 *
 * Mount this BEFORE the legacy router in routes.ts so ts-rest matches
 * its own routes first; unmatched paths fall through to the legacy router.
 *
 * To activate: in routes.ts, call mountThreadsContractRouter(app) before
 * mounting the legacy threadsController router.
 */

import { threadsContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { generateThreadTitle } from '../../services/chat/threadTitleService.js';
import { getAIWorkerPool } from '../../utils/getAIWorkerPool.js';
import { createLogger } from '../../utils/logger.js';

import {
  getUser,
  getThreadSettings,
  updateThreadSettings,
} from './services/threadPersistenceService.js';

import type { AuthenticatedRequest } from '../../middleware/types.js';
import type { Application, Request } from 'express';

const log = createLogger('threadsContractRouter');

function getUserId(req: Request): string {
  return (req as unknown as AuthenticatedRequest).user!.id;
}

const s = initServer();

export const threadsContractRouter = s.router(threadsContract, {
  list: async (args) => {
    try {
      const userId = getUserId(args.req);
      const statusFilter = args.query.status;
      const postgres = getPostgresInstance();

      const params: unknown[] = [userId, userId];
      let statusClause = '';
      if (statusFilter) {
        statusClause = ' AND COALESCE(status, $3) = $3';
        params.push(statusFilter);
      }

      const rows = await postgres.query(
        `SELECT t.id, t.user_id, t.agent_id, t.title, t.created_at, t.updated_at,
                COALESCE(t.status, 'regular') as status, COALESCE(t.thread_type, 'chat') as thread_type,
                t.notebook_collection_id,
                CASE
                  WHEN t.user_id::text = $1 THEN 'owner'
                  WHEN t.permissions ? $2::text THEN 'shared'
                  ELSE 'group'
                END as access_type,
                m.content as last_msg_content, m.role as last_msg_role, m.created_at as last_msg_created_at
         FROM chat_threads t
         LEFT JOIN LATERAL (
           SELECT content, role, created_at
           FROM chat_messages
           WHERE thread_id = t.id
           ORDER BY created_at DESC
           LIMIT 1
         ) m ON true
         WHERE (
           t.user_id::text = $1
           OR t.permissions ? $2::text
           OR t.is_public = true
           OR t.id IN (
             SELECT gcs.content_id::uuid FROM group_content_shares gcs
             INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id AND gm.user_id::text = $1
             WHERE gcs.content_type = 'chat_threads'
           )
         )${statusClause}
         ORDER BY t.updated_at DESC`,
        params
      );

      const threadsWithLastMessage = rows.map((row) => ({
        id: row.id as string,
        userId: row.user_id as string,
        agentId: row.agent_id as string,
        title: row.title as string,
        status: (row.status as string) || 'regular',
        threadType: (row.thread_type as string) || 'chat',
        notebookCollectionId: (row.notebook_collection_id as string) || null,
        createdAt: row.created_at as Date,
        updatedAt: row.updated_at as Date,
        user_id: row.user_id as string,
        agent_id: row.agent_id as string,
        created_at: row.created_at as Date,
        updated_at: row.updated_at as Date,
        lastMessage: row.last_msg_content
          ? {
              content: row.last_msg_content as string,
              role: row.last_msg_role as string,
              created_at: row.last_msg_created_at as Date,
            }
          : null,
      }));

      // Serialise Date fields → ISO strings for the wire (contract expects strings)
      const serialised = threadsWithLastMessage.map((t) => ({
        id: t.id,
        userId: t.userId,
        agentId: t.agentId,
        title: t.title ?? null,
        status: t.status,
        threadType: t.threadType,
        notebookCollectionId: t.notebookCollectionId ?? null,
        createdAt: (t.createdAt instanceof Date
          ? t.createdAt
          : new Date(t.createdAt as unknown as string)
        ).toISOString(),
        updatedAt: (t.updatedAt instanceof Date
          ? t.updatedAt
          : new Date(t.updatedAt as unknown as string)
        ).toISOString(),
        lastMessage: t.lastMessage
          ? {
              content: t.lastMessage.content,
              role: t.lastMessage.role,
              created_at: (t.lastMessage.created_at instanceof Date
                ? t.lastMessage.created_at
                : new Date(t.lastMessage.created_at as unknown as string)
              ).toISOString(),
            }
          : null,
      }));

      return { status: 200 as const, body: serialised };
    } catch (error) {
      log.error('Error fetching threads:', error);
      return { status: 500 as const, body: { error: 'Failed to fetch threads' } };
    }
  },

  create: async (args) => {
    try {
      const userId = getUserId(args.req);
      const { title, agentId, threadType } = args.body;

      const postgres = getPostgresInstance();
      const result = await postgres.query(
        `INSERT INTO chat_threads (user_id, agent_id, title, thread_type)
         VALUES ($1, $2, $3, $4)
         RETURNING id, user_id, agent_id, title, created_at, updated_at, COALESCE(thread_type, 'chat') as thread_type`,
        [userId, agentId || 'gruenerator-universal', title ?? null, threadType || 'chat']
      );

      const thread = result[0];
      return {
        status: 201 as const,
        body: {
          id: thread.id as string,
          userId: thread.user_id as string,
          agentId: thread.agent_id as string,
          title: (thread.title as string) ?? null,
          createdAt: (thread.created_at as Date).toISOString(),
          updatedAt: (thread.updated_at as Date).toISOString(),
        },
      };
    } catch (error) {
      log.error('Error creating thread:', error);
      return { status: 500 as const, body: { error: 'Failed to create thread' } };
    }
  },

  update: async (args) => {
    try {
      const userId = getUserId(args.req);
      const { threadId, title, status } = args.body;

      const postgres = getPostgresInstance();

      const existingThreads = await postgres.query(
        `SELECT id, user_id FROM chat_threads WHERE id = $1 LIMIT 1`,
        [threadId]
      );

      if (existingThreads.length === 0) {
        return { status: 404 as const, body: { error: 'Thread not found' } };
      }

      if (existingThreads[0].user_id !== userId) {
        return { status: 403 as const, body: { error: 'Forbidden' } };
      }

      const setClauses: string[] = ['updated_at = CURRENT_TIMESTAMP'];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (title !== undefined) {
        setClauses.push(`title = $${paramIdx}`);
        params.push(title);
        paramIdx++;
      }

      if (status !== undefined) {
        setClauses.push(`status = $${paramIdx}`);
        params.push(status);
        paramIdx++;
      }

      params.push(threadId);

      const result = await postgres.query(
        `UPDATE chat_threads
         SET ${setClauses.join(', ')}
         WHERE id = $${paramIdx}
         RETURNING id, user_id, agent_id, title, COALESCE(status, 'regular') as status, created_at, updated_at`,
        params
      );

      if (result.length === 0) {
        return { status: 500 as const, body: { error: 'Failed to update thread' } };
      }

      const thread = result[0];
      return {
        status: 200 as const,
        body: {
          id: thread.id as string,
          userId: thread.user_id as string,
          agentId: thread.agent_id as string,
          title: (thread.title as string) ?? null,
          status: thread.status as string,
          createdAt: (thread.created_at as Date).toISOString(),
          updatedAt: (thread.updated_at as Date).toISOString(),
        },
      };
    } catch (error) {
      log.error('Error updating thread:', error);
      return { status: 500 as const, body: { error: 'Failed to update thread' } };
    }
  },

  delete: async (args) => {
    try {
      const userId = getUserId(args.req);
      const { threadId } = args.query;

      const postgres = getPostgresInstance();

      const existingThreads = await postgres.query(
        `SELECT id, user_id FROM chat_threads WHERE id = $1 LIMIT 1`,
        [threadId]
      );

      if (existingThreads.length === 0) {
        return { status: 404 as const, body: { error: 'Thread not found' } };
      }

      if (existingThreads[0].user_id !== userId) {
        return { status: 403 as const, body: { error: 'Forbidden' } };
      }

      await postgres.query(`DELETE FROM chat_threads WHERE id = $1`, [threadId]);

      return { status: 200 as const, body: { success: true as const } };
    } catch (error) {
      log.error('Error deleting thread:', error);
      return { status: 500 as const, body: { error: 'Failed to delete thread' } };
    }
  },

  getSettings: async (args) => {
    try {
      const userId = getUserId(args.req);
      const { threadId } = args.params;

      const postgres = getPostgresInstance();
      const threads = await postgres.query(
        `SELECT user_id FROM chat_threads WHERE id = $1 LIMIT 1`,
        [threadId]
      );
      if (threads.length === 0) {
        return { status: 404 as const, body: { error: 'Thread not found' } };
      }
      if (threads[0].user_id !== userId) {
        return { status: 403 as const, body: { error: 'Forbidden' } };
      }

      const settings = await getThreadSettings(threadId);
      return {
        status: 200 as const,
        body: {
          customSystemPrompt: settings?.custom_system_prompt ?? null,
          customEnabledTools: settings?.custom_enabled_tools ?? null,
        },
      };
    } catch (error) {
      log.error('Error fetching thread settings:', error);
      return { status: 500 as const, body: { error: 'Failed to fetch thread settings' } };
    }
  },

  updateSettings: async (args) => {
    try {
      const userId = getUserId(args.req);
      const { threadId } = args.params;
      const { customSystemPrompt, customEnabledTools } = args.body;

      const updated = await updateThreadSettings(threadId, userId, {
        ...(customSystemPrompt !== undefined && { customSystemPrompt }),
        ...(customEnabledTools !== undefined && { customEnabledTools }),
      });

      if (!updated) {
        return { status: 404 as const, body: { error: 'Thread not found or forbidden' } };
      }

      return { status: 200 as const, body: { success: true as const } };
    } catch (error) {
      log.error('Error updating thread settings:', error);
      return { status: 500 as const, body: { error: 'Failed to update thread settings' } };
    }
  },

  generateTitle: async (args) => {
    try {
      const userId = getUserId(args.req);
      const { threadId } = args.params;

      log.info(`[generate-title] Endpoint hit for threadId=${threadId}, userId=${userId}`);
      const postgres = getPostgresInstance();

      const threads = await postgres.query(
        `SELECT id, user_id FROM chat_threads WHERE id = $1 LIMIT 1`,
        [threadId]
      );

      if (threads.length === 0) {
        log.warn(`[generate-title] Thread not found: ${threadId}`);
        return { status: 404 as const, body: { error: 'Thread not found' } };
      }

      if (threads[0].user_id !== userId) {
        log.warn(
          `[generate-title] Forbidden — thread owner=${threads[0].user_id as string}, requester=${userId}`
        );
        return { status: 403 as const, body: { error: 'Forbidden' } };
      }

      const messages = await postgres.query(
        `SELECT role, content FROM chat_messages
         WHERE thread_id = $1
         ORDER BY created_at ASC
         LIMIT 4`,
        [threadId]
      );

      log.info(
        `[generate-title] Found ${messages.length} messages for thread ${threadId}:`,
        messages.map((m) => ({ role: m.role as string, contentLen: String(m.content).length }))
      );

      const userMsg = messages.find((m) => m.role === 'user');
      const assistantMsg = messages.find((m) => m.role === 'assistant');

      if (!userMsg || !assistantMsg) {
        log.warn(
          `[generate-title] Skipping — userMsg=${!!userMsg}, assistantMsg=${!!assistantMsg}`
        );
        return {
          status: 202 as const,
          body: { status: 'skipped' as const, reason: 'insufficient messages' },
        };
      }

      let aiWorkerPool;
      try {
        aiWorkerPool = getAIWorkerPool(args.req);
      } catch {
        log.error(`[generate-title] AI worker pool not available!`);
        return { status: 503 as const, body: { error: 'AI worker pool not available' } };
      }

      log.info(`[generate-title] Calling generateThreadTitle for ${threadId}`);

      // Fire-and-forget: generates fallback + async AI title
      generateThreadTitle(
        threadId,
        String(userMsg.content),
        String(assistantMsg.content),
        aiWorkerPool
      ).catch((err) => {
        log.warn(`[generate-title] Failed for thread ${threadId}:`, err);
      });

      return { status: 202 as const, body: { status: 'accepted' as const } };
    } catch (error) {
      log.error('Error generating thread title:', error);
      return { status: 500 as const, body: { error: 'Failed to generate title' } };
    }
  },
});

/**
 * Mount the ts-rest contract router onto an Express app instance.
 * Call this from routes.ts BEFORE mounting the legacy threadsController.
 */
export function mountThreadsContractRouter(app: Application): void {
  createExpressEndpoints(threadsContract, threadsContractRouter, app, {
    requestValidationErrorHandler: 'combined',
  });
}

/**
 * Chat Threads Controller
 * CRUD operations for chat threads
 */

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { generateThreadTitle } from '../../services/chat/threadTitleService.js';
import { createAuthenticatedRouter } from '../../utils/keycloak/index.js';
import { createLogger } from '../../utils/logger.js';

import type { Thread, ThreadWithLastMessage } from './agents/types.js';
import type { UserProfile } from '../../services/user/types.js';
import type express from 'express';

const log = createLogger('ThreadsController');
const router = createAuthenticatedRouter();

const getUser = (req: express.Request): UserProfile | undefined =>
  (req as any).user as UserProfile | undefined;

router.get('/', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const statusFilter = (req.query.status as string) || undefined;
    const postgres = getPostgresInstance();

    const params: unknown[] = [user.id];
    let statusClause = '';
    if (statusFilter) {
      statusClause = ' AND COALESCE(status, $2) = $2';
      params.push(statusFilter);
    }

    const threads = await postgres.query(
      `SELECT id, user_id, agent_id, title, created_at, updated_at, COALESCE(status, 'regular') as status
       FROM chat_threads
       WHERE user_id = $1${statusClause}
       ORDER BY updated_at DESC`,
      params
    );

    const threadsWithLastMessage: ThreadWithLastMessage[] = await Promise.all(
      threads.map(async (thread) => {
        const messages = await postgres.query(
          `SELECT content, role, created_at
           FROM chat_messages
           WHERE thread_id = $1
           ORDER BY created_at DESC
           LIMIT 1`,
          [thread.id]
        );

        const lastMsg = messages[0] as
          | { content: string; role: string; created_at: Date }
          | undefined;
        return {
          id: thread.id as string,
          userId: thread.user_id as string,
          agentId: thread.agent_id as string,
          title: thread.title as string,
          status: (thread.status as string) || 'regular',
          createdAt: thread.created_at as Date,
          updatedAt: thread.updated_at as Date,
          user_id: thread.user_id as string,
          agent_id: thread.agent_id as string,
          created_at: thread.created_at as Date,
          updated_at: thread.updated_at as Date,
          lastMessage: lastMsg || null,
        };
      })
    );

    res.json(threadsWithLastMessage);
  } catch (error) {
    log.error('Error fetching threads:', error);
    res.status(500).json({ error: 'Failed to fetch threads' });
  }
});

router.post('/', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { title, agentId } = req.body;

    const postgres = getPostgresInstance();
    const result = await postgres.query(
      `INSERT INTO chat_threads (user_id, agent_id, title)
       VALUES ($1, $2, $3)
       RETURNING id, user_id, agent_id, title, created_at, updated_at`,
      [user.id, agentId || 'gruenerator-universal', title || null]
    );

    const thread = result[0];
    res.status(201).json({
      id: thread.id,
      userId: thread.user_id,
      agentId: thread.agent_id,
      title: thread.title,
      createdAt: thread.created_at,
      updatedAt: thread.updated_at,
    });
  } catch (error) {
    log.error('Error creating thread:', error);
    res.status(500).json({ error: 'Failed to create thread' });
  }
});

router.patch('/', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { threadId, title, status } = req.body;

    if (!threadId) {
      return res.status(400).json({ error: 'Thread ID is required' });
    }

    if (status && !['regular', 'archived'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be "regular" or "archived"' });
    }

    const postgres = getPostgresInstance();

    const existingThreads = await postgres.query(
      `SELECT id, user_id FROM chat_threads WHERE id = $1 LIMIT 1`,
      [threadId]
    );

    if (existingThreads.length === 0) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    if (existingThreads[0].user_id !== user.id) {
      return res.status(403).json({ error: 'Forbidden' });
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
      return res.status(500).json({ error: 'Failed to update thread' });
    }

    const thread = result[0];
    res.json({
      id: thread.id,
      userId: thread.user_id,
      agentId: thread.agent_id,
      title: thread.title,
      status: thread.status,
      createdAt: thread.created_at,
      updatedAt: thread.updated_at,
    });
  } catch (error) {
    log.error('Error updating thread:', error);
    res.status(500).json({ error: 'Failed to update thread' });
  }
});

router.delete('/', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const threadId = req.query.threadId as string;

    if (!threadId) {
      return res.status(400).json({ error: 'Thread ID is required' });
    }

    const postgres = getPostgresInstance();

    const existingThreads = await postgres.query(
      `SELECT id, user_id FROM chat_threads WHERE id = $1 LIMIT 1`,
      [threadId]
    );

    if (existingThreads.length === 0) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    if (existingThreads[0].user_id !== user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await postgres.query(`DELETE FROM chat_threads WHERE id = $1`, [threadId]);

    res.json({ success: true });
  } catch (error) {
    log.error('Error deleting thread:', error);
    res.status(500).json({ error: 'Failed to delete thread' });
  }
});

router.post('/:threadId/generate-title', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { threadId } = req.params;
    log.info(`[generate-title] Endpoint hit for threadId=${threadId}, userId=${user.id}`);
    const postgres = getPostgresInstance();

    const threads = await postgres.query(
      `SELECT id, user_id FROM chat_threads WHERE id = $1 LIMIT 1`,
      [threadId]
    );

    if (threads.length === 0) {
      log.warn(`[generate-title] Thread not found: ${threadId}`);
      return res.status(404).json({ error: 'Thread not found' });
    }

    if (threads[0].user_id !== user.id) {
      log.warn(
        `[generate-title] Forbidden — thread owner=${threads[0].user_id}, requester=${user.id}`
      );
      return res.status(403).json({ error: 'Forbidden' });
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
      messages.map((m: any) => ({ role: m.role, contentLen: String(m.content).length }))
    );

    const userMsg = messages.find((m: any) => m.role === 'user');
    const assistantMsg = messages.find((m: any) => m.role === 'assistant');

    if (!userMsg || !assistantMsg) {
      log.warn(`[generate-title] Skipping — userMsg=${!!userMsg}, assistantMsg=${!!assistantMsg}`);
      return res.status(202).json({ status: 'skipped', reason: 'insufficient messages' });
    }

    log.info(
      `[generate-title] User message (first 100 chars): ${String(userMsg.content).slice(0, 100)}`
    );
    log.info(
      `[generate-title] Assistant message (first 100 chars): ${String(assistantMsg.content).slice(0, 100)}`
    );

    const aiWorkerPool = req.app.locals.aiWorkerPool;
    if (!aiWorkerPool) {
      log.error(`[generate-title] AI worker pool not available!`);
      return res.status(503).json({ error: 'AI worker pool not available' });
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

    res.status(202).json({ status: 'accepted' });
  } catch (error) {
    log.error('Error generating thread title:', error);
    res.status(500).json({ error: 'Failed to generate title' });
  }
});

export default router;

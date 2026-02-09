/**
 * Chat Threads Controller
 * CRUD operations for chat threads
 */

import express from 'express';
import { createAuthenticatedRouter } from '../../utils/keycloak/index.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createLogger } from '../../utils/logger.js';
import type { UserProfile } from '../../services/user/types.js';
import type { Thread, ThreadWithLastMessage } from './agents/types.js';

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

    const postgres = getPostgresInstance();
    const threads = await postgres.query(
      `SELECT id, user_id, agent_id, title, created_at, updated_at
       FROM chat_threads
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [user.id]
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

        const lastMsg = messages[0] as { content: string; role: string; created_at: Date } | undefined;
        return {
          id: thread.id as string,
          userId: thread.user_id as string,
          agentId: thread.agent_id as string,
          title: thread.title as string,
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

    const { threadId, title } = req.body;

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

    const result = await postgres.query(
      `UPDATE chat_threads
       SET title = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, user_id, agent_id, title, created_at, updated_at`,
      [title, threadId]
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

export default router;

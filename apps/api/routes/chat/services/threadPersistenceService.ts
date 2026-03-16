/**
 * Thread Persistence Service
 *
 * Database operations for chat threads and messages.
 * Wraps PostgreSQL queries for thread CRUD and message storage.
 */

import { getPostgresInstance } from '../../../database/services/PostgresService.js';

import type { UserProfile } from '../../../services/user/types.js';
import type express from 'express';

/**
 * Get user from request.
 */
export const getUser = (req: express.Request): UserProfile | undefined =>
  (req as any).user as UserProfile | undefined;

/**
 * Create a new chat thread.
 */
export async function createThread(
  userId: string,
  agentId: string,
  title?: string,
  threadType?: 'chat' | 'search'
): Promise<{
  id: string;
  user_id: string;
  agent_id: string;
  title: string | null;
  thread_type: string;
}> {
  const postgres = getPostgresInstance();
  const result = (await postgres.query(
    `INSERT INTO chat_threads (user_id, agent_id, title, thread_type)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_id, agent_id, title, thread_type`,
    [userId, agentId, title || null, threadType || 'chat']
  )) as {
    id: string;
    user_id: string;
    agent_id: string;
    title: string | null;
    thread_type: string;
  }[];
  return result[0];
}

/**
 * Save a message to the thread.
 */
export async function createMessage(
  threadId: string,
  role: string,
  content: string | null,
  metadata?: Record<string, unknown>,
  userId?: string
): Promise<void> {
  const postgres = getPostgresInstance();
  await postgres.query(
    `INSERT INTO chat_messages (thread_id, role, content, tool_results, user_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [threadId, role, content, metadata ? JSON.stringify(metadata) : null, userId || null]
  );
}

/**
 * Check if a thread exists.
 */
export async function threadExists(threadId: string): Promise<boolean> {
  const postgres = getPostgresInstance();
  const result = (await postgres.query(`SELECT 1 FROM chat_threads WHERE id = $1`, [
    threadId,
  ])) as unknown[];
  return result.length > 0;
}

/**
 * Update thread timestamp.
 */
export async function touchThread(threadId: string): Promise<void> {
  const postgres = getPostgresInstance();
  await postgres.query(`UPDATE chat_threads SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [
    threadId,
  ]);
}

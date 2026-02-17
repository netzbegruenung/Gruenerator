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
  title?: string
): Promise<{ id: string; user_id: string; agent_id: string; title: string | null }> {
  const postgres = getPostgresInstance();
  const result = (await postgres.query(
    `INSERT INTO chat_threads (user_id, agent_id, title)
     VALUES ($1, $2, $3)
     RETURNING id, user_id, agent_id, title`,
    [userId, agentId, title || null]
  )) as { id: string; user_id: string; agent_id: string; title: string | null }[];
  return result[0];
}

/**
 * Save a message to the thread.
 */
export async function createMessage(
  threadId: string,
  role: string,
  content: string | null,
  metadata?: Record<string, unknown>
): Promise<void> {
  const postgres = getPostgresInstance();
  await postgres.query(
    `INSERT INTO chat_messages (thread_id, role, content, tool_results)
     VALUES ($1, $2, $3, $4)`,
    [threadId, role, content, metadata ? JSON.stringify(metadata) : null]
  );
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

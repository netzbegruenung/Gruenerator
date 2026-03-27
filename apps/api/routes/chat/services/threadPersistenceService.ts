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
  threadType?: 'chat' | 'search' | 'notebook',
  options?: {
    notebookCollectionId?: string;
    notebookCollectionIds?: string[];
  }
): Promise<{
  id: string;
  user_id: string;
  agent_id: string;
  title: string | null;
  thread_type: string;
}> {
  const postgres = getPostgresInstance();
  const result = (await postgres.query(
    `INSERT INTO chat_threads (user_id, agent_id, title, thread_type, notebook_collection_id, notebook_collection_ids)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, user_id, agent_id, title, thread_type`,
    [
      userId,
      agentId,
      title || null,
      threadType || 'chat',
      options?.notebookCollectionId || null,
      options?.notebookCollectionIds ? JSON.stringify(options.notebookCollectionIds) : null,
    ]
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

export interface ThreadSettings {
  custom_system_prompt: string | null;
  custom_enabled_tools: Record<string, boolean> | null;
}

export async function getThreadSettings(threadId: string): Promise<ThreadSettings | null> {
  const postgres = getPostgresInstance();
  const result = await postgres.query(
    `SELECT custom_system_prompt, custom_enabled_tools FROM chat_threads WHERE id = $1`,
    [threadId]
  );
  if (!result[0]) return null;
  return {
    custom_system_prompt: (result[0].custom_system_prompt as string) || null,
    custom_enabled_tools: (result[0].custom_enabled_tools as Record<string, boolean>) || null,
  };
}

export async function updateThreadSettings(
  threadId: string,
  userId: string,
  settings: {
    customSystemPrompt?: string | null;
    customEnabledTools?: Record<string, boolean> | null;
  }
): Promise<boolean> {
  const postgres = getPostgresInstance();
  const setClauses: string[] = ['updated_at = CURRENT_TIMESTAMP'];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (settings.customSystemPrompt !== undefined) {
    setClauses.push(`custom_system_prompt = $${paramIdx}`);
    params.push(settings.customSystemPrompt);
    paramIdx++;
  }

  if (settings.customEnabledTools !== undefined) {
    setClauses.push(`custom_enabled_tools = $${paramIdx}`);
    params.push(settings.customEnabledTools ? JSON.stringify(settings.customEnabledTools) : null);
    paramIdx++;
  }

  params.push(threadId, userId);

  const result = await postgres.query(
    `UPDATE chat_threads SET ${setClauses.join(', ')} WHERE id = $${paramIdx} AND user_id = $${paramIdx + 1} RETURNING id`,
    params
  );
  return (result as unknown[]).length > 0;
}

/**
 * Thread Persistence Service
 *
 * Database operations for chat threads and messages.
 * Wraps PostgreSQL queries for thread CRUD and message storage.
 */

import { generateSlugSuffix } from '@gruenerator/shared/utils';

import { getPostgresInstance } from '../../../database/services/PostgresService.js';

import type { UserProfile } from '../../../services/user/types.js';
import type { AuthRequest } from '../../auth/types.js';
import type express from 'express';

/**
 * Get typed user from request.
 * Accepts both AuthRequest (typed user) and plain Request (Keycloak middleware).
 */
export const getUser = (req: AuthRequest | express.Request): UserProfile | undefined =>
  (req as AuthRequest).user;

const UNIQUE_VIOLATION = '23505';
const MAX_SLUG_ATTEMPTS = 5;

/**
 * Run a thread INSERT with a freshly generated slug suffix, regenerating on a
 * unique-index collision (idx_chat_threads_slug_suffix). Bounded so we never
 * loop forever; with a 56^6 keyspace a second attempt is already exceptional.
 */
export async function insertThreadWithSlugRetry<T>(
  insert: (slugSuffix: string) => Promise<T>
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    try {
      return await insert(generateSlugSuffix());
    } catch (error) {
      if ((error as { code?: string }).code !== UNIQUE_VIOLATION) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

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
  slug_suffix: string | null;
}> {
  const postgres = getPostgresInstance();
  const result = (await insertThreadWithSlugRetry((slugSuffix) =>
    postgres.query(
      `INSERT INTO chat_threads (user_id, agent_id, title, thread_type, notebook_collection_id, notebook_collection_ids, slug_suffix)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, user_id, agent_id, title, thread_type, slug_suffix`,
      [
        userId,
        agentId,
        title || null,
        threadType || 'chat',
        options?.notebookCollectionId || null,
        options?.notebookCollectionIds ? JSON.stringify(options.notebookCollectionIds) : null,
        slugSuffix,
      ]
    )
  )) as {
    id: string;
    user_id: string;
    agent_id: string;
    title: string | null;
    thread_type: string;
    slug_suffix: string | null;
  }[];
  return result[0];
}

/**
 * Ensure a chat thread exists for the given collaborative document. Idempotent —
 * one thread per doc, shared across all collaborators (real-time sharing rides
 * the existing thread permissions/collab layer). The first user to open the doc
 * becomes user_id; downstream access checks should consult both user_id and
 * the doc's permissions.
 */
export async function ensureDocChatThread(
  docId: string,
  userId: string,
  agentId: string = 'gruenerator-universal'
): Promise<{ id: string }> {
  const postgres = getPostgresInstance();
  const result = (await insertThreadWithSlugRetry((slugSuffix) =>
    postgres.query(
      `INSERT INTO chat_threads (user_id, agent_id, title, thread_type, doc_id, slug_suffix)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (doc_id) WHERE doc_id IS NOT NULL
       DO UPDATE SET updated_at = CURRENT_TIMESTAMP
       RETURNING id`,
      [userId, agentId, 'Dokument-Chat', 'chat', docId, slugSuffix]
    )
  )) as { id: string }[];
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
 * Truncate a thread from a given message onward — deletes that message and
 * every message created at or after it (by `created_at`). Used for
 * edit-and-resubmit: the edited user message and its now-stale replies are
 * removed before the fresh turn is written. Returns the number of rows deleted
 * (0 when the id doesn't resolve to a message in this thread).
 */
export async function deleteMessagesFrom(threadId: string, messageId: string): Promise<number> {
  const postgres = getPostgresInstance();
  const result = (await postgres.query(
    `DELETE FROM chat_messages
     WHERE thread_id = $1
       AND created_at >= (
         SELECT created_at FROM chat_messages WHERE id = $2 AND thread_id = $1
       )
     RETURNING id`,
    [threadId, messageId]
  )) as unknown[];
  return result.length;
}

/**
 * Delete the trailing assistant message(s) of a thread — everything after the
 * most recent user message. Used for regenerate (the user message stays; only
 * the last reply is replaced) and as the fallback for edit-resubmit when the
 * frontend id doesn't resolve to a persisted row (in-session message).
 */
export async function deleteTrailingAssistant(threadId: string): Promise<number> {
  const postgres = getPostgresInstance();
  const result = (await postgres.query(
    `DELETE FROM chat_messages
     WHERE thread_id = $1
       AND created_at > COALESCE(
         (SELECT MAX(created_at) FROM chat_messages WHERE thread_id = $1 AND role = 'user'),
         '-infinity'::timestamptz
       )
     RETURNING id`,
    [threadId]
  )) as unknown[];
  return result.length;
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

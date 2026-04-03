/**
 * Chat Search Service
 *
 * Searches past chat conversations by message content and thread title.
 * Used both by the search node (for agent context) and the REST API (for frontend search).
 */

import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import { createLogger } from '../../../utils/logger.js';

import type { ChatSearchResult } from '../../../agents/langgraph/ChatGraph/types.js';

const log = createLogger('ChatSearchService');

const SNIPPET_CONTEXT_CHARS = 100;

export interface ChatSearchOptions {
  threadType?: 'chat' | 'search' | 'notebook';
  limit?: number;
  excludeThreadId?: string;
  startDate?: Date;
  endDate?: Date;
}

/**
 * Extract a snippet around the first match of a query in text.
 */
function extractSnippet(text: string, query: string): string {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);

  if (idx === -1) {
    return (
      text.slice(0, SNIPPET_CONTEXT_CHARS * 2) +
      (text.length > SNIPPET_CONTEXT_CHARS * 2 ? '...' : '')
    );
  }

  const start = Math.max(0, idx - SNIPPET_CONTEXT_CHARS);
  const end = Math.min(text.length, idx + lowerQuery.length + SNIPPET_CONTEXT_CHARS);
  let snippet = text.slice(start, end);

  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet = snippet + '...';

  return snippet;
}

/**
 * Search chat history for a user.
 *
 * Searches both thread titles and message content using ILIKE.
 * Results are ordered by match recency and limited.
 */
export async function searchChatHistory(
  userId: string,
  query: string,
  options: ChatSearchOptions = {}
): Promise<ChatSearchResult[]> {
  const { threadType, limit = 5, excludeThreadId, startDate, endDate } = options;
  const db = getPostgresInstance();

  const searchPattern = `%${query.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;

  const params: unknown[] = [userId, searchPattern];
  let paramIdx = 3;

  let threadTypeClause = '';
  if (threadType) {
    threadTypeClause = `AND COALESCE(t.thread_type, 'chat') = $${paramIdx}`;
    params.push(threadType);
    paramIdx++;
  }

  let excludeClause = '';
  if (excludeThreadId) {
    excludeClause = `AND t.id != $${paramIdx}::uuid`;
    params.push(excludeThreadId);
    paramIdx++;
  }

  let dateFromClause = '';
  if (startDate) {
    dateFromClause = `AND m.created_at >= $${paramIdx}`;
    params.push(startDate.toISOString());
    paramIdx++;
  }

  let dateToClause = '';
  if (endDate) {
    dateToClause = `AND m.created_at <= $${paramIdx}`;
    params.push(endDate.toISOString());
    paramIdx++;
  }

  params.push(limit * 3); // Fetch extra for dedup (multiple messages per thread)
  const limitParam = `$${paramIdx}`;

  const sql = `
    SELECT
      t.id AS thread_id,
      t.title AS thread_title,
      t.agent_id,
      t.updated_at AS thread_updated_at,
      m.content AS message_content,
      m.role AS message_role,
      m.created_at AS matched_at
    FROM chat_messages m
    INNER JOIN chat_threads t ON t.id = m.thread_id
    WHERE (
      t.user_id = $1
      OR t.permissions ? $1::text
      OR t.is_public = true
    )
    AND m.role IN ('user', 'assistant')
    AND (m.content ILIKE $2 OR t.title ILIKE $2)
    AND COALESCE(t.status, 'regular') = 'regular'
    ${threadTypeClause}
    ${excludeClause}
    ${dateFromClause}
    ${dateToClause}
    ORDER BY m.created_at DESC
    LIMIT ${limitParam}
  `;

  try {
    interface ChatSearchRow {
      thread_id: string;
      thread_title: string | null;
      agent_id: string;
      thread_updated_at: string;
      message_content: string | null;
      message_role: string;
      matched_at: string;
    }
    const rows = (await db.query(sql, params)) as ChatSearchRow[];

    const seen = new Set<string>();
    const results: ChatSearchResult[] = [];

    for (const row of rows) {
      if (seen.has(row.thread_id)) continue;
      seen.add(row.thread_id);

      results.push({
        threadId: row.thread_id,
        threadTitle: row.thread_title,
        agentId: row.agent_id,
        snippet: extractSnippet(row.message_content || row.thread_title || '', query),
        messageRole: row.message_role as 'user' | 'assistant',
        matchedAt: row.matched_at,
        threadUpdatedAt: row.thread_updated_at,
      });

      if (results.length >= limit) break;
    }

    log.info(`[ChatSearch] Found ${results.length} threads for "${query}" (user: ${userId})`);
    return results;
  } catch (err) {
    log.error(`[ChatSearch] Search failed for "${query}":`, err);
    return [];
  }
}

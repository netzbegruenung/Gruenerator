/**
 * Chat Search Service
 *
 * Searches past chat conversations by message content and thread title.
 * Used both by the search node (for agent context) and the REST API (for frontend search).
 */

import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import { createLogger } from '../../../utils/logger.js';
import { likeContainsPattern } from '../../../utils/sqlLike.js';
import { toIsoString } from '../../../utils/toIsoString.js';

import type { ChatSearchResult } from '../../../agents/langgraph/ChatGraph/types.js';

const log = createLogger('ChatSearchService');

const SNIPPET_CONTEXT_CHARS = 100;

export interface ChatSearchOptions {
  threadType?: 'chat' | 'search' | 'notebook';
  limit?: number;
  excludeThreadId?: string;
  startDate?: Date;
  endDate?: Date;
  /** Filter to threads carrying at least one of these tags. */
  tags?: string[];
  /** Folder scope: restrict to this set of thread ids (a folder's chats). */
  threadIds?: string[];
  /**
   * Restrict to threads the user owns or was explicitly shared. Without it,
   * every `is_public` thread in the system matches — right for agent context
   * and the in-chat search, wrong for a personal "my content" search.
   */
  ownedOnly?: boolean;
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
  const {
    threadType,
    limit = 5,
    excludeThreadId,
    startDate,
    endDate,
    tags,
    threadIds,
    ownedOnly = false,
  } = options;
  const db = getPostgresInstance();

  const params: unknown[] = [userId];
  let paramIdx = 2;

  // Text match is optional: a tag-only search (empty query) must NOT be gated by
  // a content/title predicate, or threads whose only messages have NULL content
  // and no title would be silently excluded despite matching the tag.
  let textClause = '';
  if (query.trim().length > 0) {
    textClause = `AND (m.content ILIKE $${paramIdx} OR t.title ILIKE $${paramIdx})`;
    params.push(likeContainsPattern(query));
    paramIdx++;
  }

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

  let tagsClause = '';
  if (tags && tags.length > 0) {
    // jsonb ?| text[] — thread's tags array overlaps any of the requested tags.
    tagsClause = `AND t.tags ?| $${paramIdx}::text[]`;
    params.push(tags);
    paramIdx++;
  }

  let folderScopeClause = '';
  if (threadIds && threadIds.length > 0) {
    // Folder scope: restrict to a specific set of thread ids.
    folderScopeClause = `AND t.id = ANY($${paramIdx}::uuid[])`;
    params.push(threadIds);
    paramIdx++;
  }

  params.push(limit * 3); // Fetch extra for dedup (multiple messages per thread)
  const limitParam = `$${paramIdx}`;

  const sql = `
    SELECT
      t.id AS thread_id,
      t.title AS thread_title,
      t.agent_id,
      t.slug_suffix AS thread_slug_suffix,
      t.updated_at AS thread_updated_at,
      m.content AS message_content,
      m.role AS message_role,
      m.created_at AS matched_at
    FROM chat_messages m
    INNER JOIN chat_threads t ON t.id = m.thread_id
    WHERE (
      t.user_id = $1
      OR t.permissions ? $1::text
      ${ownedOnly ? '' : 'OR t.is_public = true'}
    )
    AND m.role IN ('user', 'assistant')
    ${textClause}
    AND COALESCE(t.status, 'regular') = 'regular'
    ${threadTypeClause}
    ${excludeClause}
    ${dateFromClause}
    ${dateToClause}
    ${tagsClause}
    ${folderScopeClause}
    ORDER BY m.created_at DESC
    LIMIT ${limitParam}
  `;

  try {
    // node-postgres hands back `Date` for timestamptz columns.
    interface ChatSearchRow {
      thread_id: string;
      thread_title: string | null;
      agent_id: string;
      thread_slug_suffix: string | null;
      thread_updated_at: Date | string;
      message_content: string | null;
      message_role: string;
      matched_at: Date | string;
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
        threadSlugSuffix: row.thread_slug_suffix,
        agentId: row.agent_id,
        snippet: extractSnippet(row.message_content || row.thread_title || '', query),
        messageRole: row.message_role as 'user' | 'assistant',
        matchedAt: toIsoString(row.matched_at),
        threadUpdatedAt: toIsoString(row.thread_updated_at),
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

/**
 * Thread Persistence Service
 *
 * Database operations for chat threads and messages.
 * Wraps PostgreSQL queries for thread CRUD and message storage.
 */

import { type NotebookSourceRef, type RoleRef } from '@gruenerator/contracts';
import { generateSlugSuffix } from '@gruenerator/shared/utils';

import { getPostgresInstance } from '../../../database/services/PostgresService.js';

import { type PersistedStep } from './agenticLoop/types.js';
import { type ArtifactKindId } from './artifactKindRegistry.js';
import { parseRecordedOffer } from './artifactOffer.js';
import { toJsonbParam, toTextParam } from './jsonbParam.js';
import { type ThreadCloudFiles, parseThreadCloudFiles } from './threadCloudFiles.js';
import {
  type ThreadMentionRefs,
  isEmptyThreadMentionRefs,
  parseThreadMentionRefs,
} from './threadMentionRefs.js';
import { parseThreadNotebookSources } from './threadNotebookSources.js';
import {
  type ArtifactMetadataShape,
  ROW_WINDOW,
  toArtifacts,
  toRecipesUsed,
  toSources,
  toToolSteps,
  type UsedRecipeRef,
} from './threadToolProjections.js';

import type { SearchResult, ThreadToolContext } from '../../../agents/langgraph/ChatGraph/types.js';
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
    /** Projekt, in dem der Thread liegt (nur nach geprüfter Mitgliedschaft setzen). */
    groupId?: string;
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
      `INSERT INTO chat_threads (user_id, agent_id, title, thread_type, notebook_collection_id, notebook_collection_ids, slug_suffix, group_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, user_id, agent_id, title, thread_type, slug_suffix`,
      [
        userId,
        agentId,
        title || null,
        threadType || 'chat',
        options?.notebookCollectionId || null,
        options?.notebookCollectionIds ? JSON.stringify(options.notebookCollectionIds) : null,
        slugSuffix,
        options?.groupId ?? null,
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
): Promise<string> {
  const postgres = getPostgresInstance();
  const result = (await postgres.query(
    `INSERT INTO chat_messages (thread_id, role, content, tool_results, user_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [threadId, role, toTextParam(content), toJsonbParam(metadata), userId || null]
  )) as { id: string }[];
  return result[0]!.id;
}

/**
 * Turn persistence (crash/abort durability). An assistant turn writes a
 * placeholder row BEFORE the LLM stream starts (status 'streaming'), fills it
 * periodically while streaming, and flips it to 'complete' on finalize. A row
 * left 'streaming' after the request ended is an aborted turn — read-time
 * derives `interrupted` from it (see messagesController). The empty ones are
 * swept; ones carrying partial text are kept as interrupted turns.
 */
export async function createPendingAssistantMessage(
  threadId: string,
  userId?: string
): Promise<string> {
  const postgres = getPostgresInstance();
  const result = (await postgres.query(
    `INSERT INTO chat_messages (thread_id, role, content, user_id, status)
     VALUES ($1, 'assistant', NULL, $2, 'streaming')
     RETURNING id`,
    [threadId, userId || null]
  )) as { id: string }[];
  return result[0].id;
}

/**
 * Throttled partial-text write during streaming. Guarded on status='streaming'
 * so a late flush that lands AFTER finalize (which set status='complete') is a
 * no-op and can never clobber the finalized content.
 */
export async function updatePendingAssistantText(messageId: string, text: string): Promise<void> {
  const postgres = getPostgresInstance();
  await postgres.query(
    `UPDATE chat_messages SET content = $2 WHERE id = $1 AND status = 'streaming'`,
    [messageId, toTextParam(text)]
  );
}

/**
 * Finalize the placeholder into a completed assistant message: set the final
 * content + tool_results metadata and flip status to 'complete'. Returns false
 * when no row matched (e.g. a regenerate from another tab deleted the row) —
 * the caller then skips a re-insert and only warns.
 *
 * Also stamps `turnDurationMs` into the metadata: the placeholder was written
 * when the turn started (`createPendingAssistantMessage`), so its `created_at`
 * is the start and this statement is the end. Done here, in SQL, so every
 * finalize path records it without each caller keeping a clock. Null metadata
 * stays null — an object would change what the reader takes the row for.
 *
 * A turn that paused (tool approval, `ask_human`, client tool) is finalized on
 * the SAME row twice: once at the pause, once after the resume. The second
 * `now() - created_at` would include however long the person took to answer —
 * hours, up to the approval TTL. A wall time across a pause means nothing, so
 * a row that already carries one loses it instead; the run-activity row then
 * shows only the step count.
 */
export async function finalizeAssistantMessage(
  messageId: string,
  content: string | null,
  metadata?: Record<string, unknown>
): Promise<boolean> {
  const postgres = getPostgresInstance();
  const result = (await postgres.query(
    `UPDATE chat_messages
     SET content = $2,
         tool_results = CASE
           WHEN jsonb_typeof($3::jsonb) <> 'object' THEN $3::jsonb
           WHEN jsonb_typeof(tool_results) = 'object' AND tool_results ? 'turnDurationMs'
             THEN $3::jsonb - 'turnDurationMs'
           ELSE $3::jsonb || jsonb_build_object(
             'turnDurationMs', ROUND(EXTRACT(EPOCH FROM (now() - created_at)) * 1000)::bigint
           )
         END,
         status = 'complete'
     WHERE id = $1
     RETURNING id`,
    [messageId, toTextParam(content), toJsonbParam(metadata)]
  )) as unknown[];
  return result.length === 1;
}

/**
 * Mark a thread's open tool-approval card as expired.
 *
 * The pause state lives in Redis for 24 h; once it is gone the card in the
 * stored message still reads `resolved: false` and stays clickable, and every
 * click just earns "Die Freigabe ist abgelaufen". Writing `'expired'` lets the
 * client render the decided "Abgelaufen" pill instead (messageConversion).
 * Scoped to the requesting user's own, live thread.
 */
export async function expirePendingApproval(threadId: string, userId: string): Promise<void> {
  const postgres = getPostgresInstance();
  await postgres.query(
    `UPDATE chat_messages
     SET tool_results = jsonb_set(tool_results, '{pendingApproval,resolved}', '"expired"'::jsonb)
     WHERE thread_id = $1
       AND role = 'assistant'
       AND tool_results->'pendingApproval'->>'resolved' = 'false'
       AND thread_id IN (SELECT id FROM chat_threads WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL)`,
    [threadId, userId]
  );
}

/**
 * Record how a grant card was answered (`toolGrants[].resolved`) on every
 * still-open card of that server in the thread, so a reload shows the decided
 * pill instead of the buttons. Scoped to the user's own, live thread.
 */
export async function resolveToolGrant(
  threadId: string,
  userId: string,
  serverId: string,
  scope: string
): Promise<void> {
  const postgres = getPostgresInstance();
  await postgres.query(
    `UPDATE chat_messages AS m
     SET tool_results = jsonb_set(
       m.tool_results,
       '{toolGrants}',
       (SELECT jsonb_agg(
          CASE WHEN g->>'serverId' = $3 AND g->>'resolved' IS NULL
               THEN g || jsonb_build_object('resolved', $4::text)
               ELSE g END)
        FROM jsonb_array_elements(m.tool_results->'toolGrants') AS g)
     )
     WHERE m.thread_id = $1
       AND m.role = 'assistant'
       AND jsonb_typeof(m.tool_results->'toolGrants') = 'array'
       AND m.thread_id IN (SELECT id FROM chat_threads WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL)`,
    [threadId, userId, serverId, scope]
  );
}

/**
 * Keep the sources of a turn whose generation FAILED.
 *
 * Without this a deep-research turn that dies during synthesis loses all 20
 * citations: the handler returns before `persistAssistantResponse`, and
 * `discardPendingAssistantIfEmpty` then drops the still-empty placeholder. The
 * retry pays for the whole Linkup run again and `getRecentThreadSources` has
 * nothing to rehydrate.
 *
 * Deliberately finalized as a normal `complete` row carrying a short German
 * note as its content: `status` only knows 'streaming' and 'complete', and
 * inventing a third value would silently change what every reader sees. A row
 * with text also survives the discard sweep, which is exactly what we need.
 */
export async function persistSourcesOnFailure(
  messageId: string,
  noticeText: string,
  searchResults: SearchResult[],
  /** Query that produced them — the key {@link getKeptResearchForRetry} matches
   *  on, so a retry of the SAME question can skip the Linkup run entirely. */
  researchQuery?: string
): Promise<boolean> {
  if (searchResults.length === 0) return false;
  return finalizeAssistantMessage(messageId, noticeText, {
    searchResults,
    keptOnFailure: true,
    ...(researchQuery && { researchQuery }),
  });
}

/** Same question modulo case, punctuation and whitespace. */
function normalizeResearchQuery(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The research a FAILED turn already paid for, if the newest assistant message
 * kept it and the user is asking the very same thing again.
 *
 * A deep-research run costs ~17s and a Linkup call; the retry after a generation
 * failure re-ran the whole thing (observed live) although the sources were on
 * the thread 36 seconds earlier. Deliberately only the NEWEST assistant row:
 * once a normal answer follows, the retry window is over and a fresh question
 * deserves a fresh search.
 */
export async function getKeptResearchForRetry(
  threadId: string,
  query: string
): Promise<{ searchResults: SearchResult[] } | null> {
  const normalized = normalizeResearchQuery(query);
  if (normalized.length === 0) return null;

  const postgres = getPostgresInstance();
  const rows = (await postgres.query(
    `SELECT tool_results FROM chat_messages
     WHERE thread_id = $1 AND role = 'assistant'
     ORDER BY created_at DESC LIMIT 1`,
    [threadId]
  )) as Array<{ tool_results?: unknown }>;

  const meta = rows[0]?.tool_results;
  if (!meta || typeof meta !== 'object') return null;
  const kept = meta as {
    keptOnFailure?: unknown;
    researchQuery?: unknown;
    searchResults?: unknown;
  };
  if (kept.keptOnFailure !== true) return null;
  if (typeof kept.researchQuery !== 'string') return null;
  if (normalizeResearchQuery(kept.researchQuery) !== normalized) return null;
  if (!Array.isArray(kept.searchResults) || kept.searchResults.length === 0) return null;

  return { searchResults: kept.searchResults as SearchResult[] };
}

/**
 * Drop the placeholder iff it never received any text (still streaming + empty).
 * Used on abort/early-return paths: an empty streaming row would otherwise
 * render as a phantom interrupted assistant bubble. Rows WITH partial text are
 * left untouched (they are the aborted turn we want to keep).
 */
export async function discardPendingAssistantIfEmpty(messageId: string): Promise<void> {
  const postgres = getPostgresInstance();
  await postgres.query(
    `DELETE FROM chat_messages
     WHERE id = $1 AND status = 'streaming' AND (content IS NULL OR content = '')`,
    [messageId]
  );
}

/**
 * Thread of an assistant row — the access check behind the resumable-stream
 * routes, whose stream id is the turn's placeholder row id. No status filter:
 * a turn that finished a moment ago still replays in full from the store.
 */
export async function getAssistantMessageThreadId(messageId: string): Promise<string | null> {
  const postgres = getPostgresInstance();
  const rows = (await postgres.query(
    `SELECT thread_id FROM chat_messages WHERE id = $1 AND role = 'assistant'`,
    [messageId]
  )) as { thread_id: string }[];
  return rows[0]?.thread_id ?? null;
}

/**
 * Whether `userId` wrote the user message a stream answers: the latest user row
 * at or before the assistant row. A NULL `user_id` (legacy rows, deleted
 * profile) counts as the thread owner. False when the stream is unknown.
 */
export async function isStreamTurnSender(streamId: string, userId: string): Promise<boolean> {
  const postgres = getPostgresInstance();
  const rows = (await postgres.query(
    `SELECT COALESCE(
              (SELECT m.user_id FROM chat_messages m
                WHERE m.thread_id = a.thread_id AND m.role = 'user'
                  AND m.created_at <= a.created_at
                ORDER BY m.created_at DESC, m.id DESC
                LIMIT 1),
              t.user_id
            )::text = $2::text AS is_sender
       FROM chat_messages a
       JOIN chat_threads t ON t.id = a.thread_id AND t.deleted_at IS NULL
      WHERE a.id = $1 AND a.role = 'assistant'`,
    [streamId, userId]
  )) as { is_sender: boolean | null }[];
  return rows[0]?.is_sender === true;
}

/**
 * Sweep this thread's empty streaming orphans before a new turn starts — rows a
 * previous crash left behind that carry no text. Rows with partial text stay as
 * aborted turns.
 */
export async function deleteEmptyStreamingRows(threadId: string): Promise<void> {
  const postgres = getPostgresInstance();
  await postgres.query(
    `DELETE FROM chat_messages
     WHERE thread_id = $1 AND role = 'assistant' AND status = 'streaming'
       AND (content IS NULL OR content = '')`,
    [threadId]
  );
}

/**
 * Truncate a thread from a given message onward — deletes that message and
 * every message created at or after it (by `created_at`). Used for
 * edit-and-resubmit: the edited user message and its now-stale replies are
 * removed before the fresh turn is written. Returns the number of rows deleted
 * (0 when the id doesn't resolve to a message in this thread).
 *
 * In a team chat several members write into one thread, so the cut is allowed
 * only when EVERY user row at or after the anchor was written by `authorId`:
 * otherwise `'not_author'` and nothing is deleted. The anchor must be a user
 * row of a live (not trashed) thread. A legacy row with `user_id` NULL counts as
 * written by the thread owner. Check and delete are ONE statement, so a
 * concurrent write can't slip between them.
 *
 * The rule is absolute only in a team chat (a write-capable group share).
 * Without one (forks, person-shared threads) the thread owner may replace too.
 */
export async function deleteMessagesFrom(
  threadId: string,
  messageId: string,
  authorId: string
): Promise<number | 'not_author'> {
  const postgres = getPostgresInstance();
  const rows = (await postgres.query(
    `WITH anchor AS (
       SELECT m.created_at, t.user_id AS owner_id
       FROM chat_messages m
       JOIN chat_threads t ON t.id = m.thread_id
       WHERE m.id = $2 AND m.thread_id = $1 AND m.role = 'user' AND t.deleted_at IS NULL
     ),
     team AS (
       -- A team chat = a write-capable share into a live Projekt. Only there is
       -- the author rule absolute; elsewhere (fork, person-shared thread) the
       -- owner may replace turns too.
       SELECT EXISTS (
         SELECT 1 FROM group_content_shares gcs
         INNER JOIN groups tg ON tg.id = gcs.group_id AND tg.deleted_at IS NULL
         WHERE gcs.content_type = 'chat_threads' AND gcs.content_id = $1::text
           AND COALESCE((gcs.permissions->>'write')::boolean, true)
       ) AS is_team
     ),
     verdict AS (
       -- The cut takes every later row with it: a teammate's message after the
       -- anchor blocks the edit just like a foreign anchor does — unless the
       -- thread is no team chat and the sender owns it.
       SELECT (
         NOT EXISTS (
           SELECT 1 FROM chat_messages f, anchor a
           WHERE f.thread_id = $1 AND f.role = 'user' AND f.created_at >= a.created_at
             AND COALESCE(f.user_id, a.owner_id)::text <> $3::text
         )
         OR (NOT (SELECT is_team FROM team) AND a.owner_id::text = $3::text)
       ) AS ok
       FROM anchor a
     ),
     deleted AS (
       DELETE FROM chat_messages
       WHERE thread_id = $1
         AND (SELECT ok FROM verdict)
         AND created_at >= (SELECT created_at FROM anchor)
       RETURNING id
     )
     SELECT (SELECT COUNT(*) FROM deleted)::int AS deleted,
            COALESCE((SELECT ok FROM verdict), true) AS ok`,
    [threadId, messageId, authorId]
  )) as Array<{ deleted: number; ok: boolean }>;
  const row = rows[0];
  if (row && row.ok === false) return 'not_author';
  return row ? Number(row.deleted) : 0;
}

/**
 * Delete the trailing assistant message(s) of a thread — everything after the
 * most recent user message. Used for regenerate (the user message stays; only
 * the last reply is replaced) and as the fallback for edit-resubmit when the
 * frontend id doesn't resolve to a persisted row (in-session message).
 *
 * Same author rule as `deleteMessagesFrom`, checked against the last user row
 * (`'not_author'`, nothing deleted). A thread without a user row has nothing to
 * protect.
 */
export async function deleteTrailingAssistant(
  threadId: string,
  authorId: string
): Promise<number | 'not_author'> {
  const postgres = getPostgresInstance();
  const rows = (await postgres.query(
    `WITH live AS (
       SELECT user_id AS owner_id FROM chat_threads WHERE id = $1 AND deleted_at IS NULL
     ),
     team AS (
       -- A team chat = a write-capable share into a live Projekt. Only there is
       -- the author rule absolute; elsewhere (fork, person-shared thread) the
       -- owner may replace turns too.
       SELECT EXISTS (
         SELECT 1 FROM group_content_shares gcs
         INNER JOIN groups tg ON tg.id = gcs.group_id AND tg.deleted_at IS NULL
         WHERE gcs.content_type = 'chat_threads' AND gcs.content_id = $1::text
           AND COALESCE((gcs.permissions->>'write')::boolean, true)
       ) AS is_team
     ),
     last_user AS (
       SELECT m.created_at,
              (COALESCE(m.user_id, (SELECT owner_id FROM live))::text = $2::text
               OR (NOT (SELECT is_team FROM team) AND (SELECT owner_id FROM live)::text = $2::text)
              ) AS ok
       FROM chat_messages m
       WHERE m.thread_id = $1 AND m.role = 'user' AND EXISTS (SELECT 1 FROM live)
       ORDER BY m.created_at DESC
       LIMIT 1
     ),
     deleted AS (
       DELETE FROM chat_messages
       WHERE thread_id = $1
         AND EXISTS (SELECT 1 FROM live)
         AND COALESCE((SELECT ok FROM last_user), true)
         AND created_at > COALESCE((SELECT created_at FROM last_user), '-infinity'::timestamptz)
       RETURNING id
     )
     SELECT (SELECT COUNT(*) FROM deleted)::int AS deleted,
            COALESCE((SELECT ok FROM last_user), true) AS ok`,
    [threadId, authorId]
  )) as Array<{ deleted: number; ok: boolean }>;
  const row = rows[0];
  if (row && row.ok === false) return 'not_author';
  return row ? Number(row.deleted) : 0;
}

// Removed: `threadExists()` — an existence-only check with no user_id predicate.
// Its sole caller (the search-graph stream) used it to decide whether to reuse a
// client-supplied threadId, which let any authenticated caller append messages to
// another user's thread. Use `canAccessThread()` from ./threadAccessService.js
// instead: it enforces owner/permissions/public AND rejects non-UUID ids.

/**
 * Update thread timestamp.
 */
export async function touchThread(threadId: string): Promise<void> {
  const postgres = getPostgresInstance();
  await postgres.query(`UPDATE chat_threads SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [
    threadId,
  ]);
}

/**
 * Thread-pinned refs are per person (#5675): the owner's live on
 * `chat_threads`, every other writer of a team chat has a row in
 * `chat_thread_member_refs`. A sender only ever reads and writes their own —
 * another member's turn never resolves them, and nobody overwrites anybody's.
 */
type ThreadRefColumn =
  'cloud_file_refs' | 'notebook_source_refs' | 'mention_refs' | 'last_mcp_server_id';

async function readThreadRef(
  threadId: string,
  userId: string,
  column: ThreadRefColumn
): Promise<unknown> {
  const rows = await getPostgresInstance().query(
    `SELECT CASE WHEN t.user_id::text = $2::text THEN t.${column} ELSE m.${column} END AS value
       FROM chat_threads t
       LEFT JOIN chat_thread_member_refs m ON m.thread_id = t.id AND m.user_id::text = $2::text
      WHERE t.id = $1 AND t.deleted_at IS NULL`,
    [threadId, userId]
  );
  return (rows[0] as { value?: unknown } | undefined)?.value ?? null;
}

async function writeThreadRef(
  threadId: string,
  userId: string,
  column: ThreadRefColumn,
  value: string | null
): Promise<void> {
  await getPostgresInstance().query(
    `WITH owner AS (
       UPDATE chat_threads SET ${column} = $1 WHERE id = $2 AND user_id::text = $3::text RETURNING id
     )
     INSERT INTO chat_thread_member_refs (thread_id, user_id, ${column})
     SELECT t.id, $3::uuid, $1 FROM chat_threads t
      WHERE t.id = $2 AND t.deleted_at IS NULL
        AND t.user_id::text IS DISTINCT FROM $3::text
        AND NOT EXISTS (SELECT 1 FROM owner)
     ON CONFLICT (thread_id, user_id)
     DO UPDATE SET ${column} = EXCLUDED.${column}, updated_at = now()`,
    [value, threadId, userId]
  );
}

/**
 * Sticky MCP scope: the last connected server this thread's agentic loop was
 * scoped to. Read as the fallback when a follow-up names no server; written
 * (fire-and-forget) after a scoped MCP turn. A stale id (server since deleted)
 * simply resolves to no config → the loop falls back to the fan-out.
 */
export async function getThreadLastMcpServer(
  threadId: string,
  userId: string
): Promise<string | null> {
  const value = await readThreadRef(threadId, userId, 'last_mcp_server_id');
  return typeof value === 'string' && value ? value : null;
}

export async function setThreadLastMcpServer(
  threadId: string,
  userId: string,
  serverId: string
): Promise<void> {
  await writeThreadRef(threadId, userId, 'last_mcp_server_id', serverId);
}

/**
 * Generalised tool memory (see ThreadToolContext): which tool family the last
 * substantive turn used. Only written when a turn actually used one — plain
 * chat turns keep the previous context, mirroring the MCP sticky semantics.
 */
export async function getThreadToolContext(threadId: string): Promise<ThreadToolContext | null> {
  const postgres = getPostgresInstance();
  const result = await postgres.query(
    `SELECT last_tool_context FROM chat_threads WHERE id = $1 AND deleted_at IS NULL`,
    [threadId]
  );
  const raw = result[0]?.last_tool_context;
  if (!raw) return null;
  try {
    const parsed = (typeof raw === 'string' ? JSON.parse(raw) : raw) as ThreadToolContext;
    return parsed?.kind ? parsed : null;
  } catch {
    return null;
  }
}

export async function setThreadToolContext(
  threadId: string,
  context: ThreadToolContext
): Promise<void> {
  const postgres = getPostgresInstance();
  await postgres.query(`UPDATE chat_threads SET last_tool_context = $1 WHERE id = $2`, [
    JSON.stringify(context),
    threadId,
  ]);
}

/**
 * Cloud files picked in this thread — refs only, see threadCloudFiles.ts.
 * Per person on both ends (see readThreadRef): a member neither inherits nor overwrites
 * anybody else's.
 */
export async function getThreadCloudFiles(
  threadId: string,
  userId: string
): Promise<ThreadCloudFiles> {
  return parseThreadCloudFiles(await readThreadRef(threadId, userId, 'cloud_file_refs'));
}

export async function setThreadCloudFiles(
  threadId: string,
  userId: string,
  files: ThreadCloudFiles
): Promise<void> {
  const empty = files.wolke.length === 0 && files.connect.length === 0;
  await writeThreadRef(threadId, userId, 'cloud_file_refs', empty ? null : JSON.stringify(files));
}

/**
 * Notebook documents handed to this thread from the reader — refs only, see
 * threadNotebookSources.ts. Per person like the cloud files.
 */
export async function getThreadNotebookSources(
  threadId: string,
  userId: string
): Promise<NotebookSourceRef[]> {
  return parseThreadNotebookSources(await readThreadRef(threadId, userId, 'notebook_source_refs'));
}

export async function setThreadNotebookSources(
  threadId: string,
  userId: string,
  refs: NotebookSourceRef[]
): Promise<void> {
  await writeThreadRef(
    threadId,
    userId,
    'notebook_source_refs',
    refs.length === 0 ? null : JSON.stringify(refs)
  );
}

/**
 * @doc, saved-text and @link picks of this thread — refs only, see
 * threadMentionRefs.ts. Per person like the cloud files.
 */
export async function getThreadMentionRefs(
  threadId: string,
  userId: string
): Promise<ThreadMentionRefs> {
  return parseThreadMentionRefs(await readThreadRef(threadId, userId, 'mention_refs'));
}

export async function setThreadMentionRefs(
  threadId: string,
  userId: string,
  refs: ThreadMentionRefs
): Promise<void> {
  await writeThreadRef(
    threadId,
    userId,
    'mention_refs',
    isEmptyThreadMentionRefs(refs) ? null : JSON.stringify(refs)
  );
}

const WIDEST_ROW_WINDOW = Math.max(...Object.values(ROW_WINDOW));

/** The `tool_results` keys the projections below read. */
interface ThreadToolRow extends ArtifactMetadataShape {
  searchResults?: unknown[] | null;
  intent?: unknown;
  offer?: unknown;
  recipesUsed?: unknown;
}

function intentOf(row: ThreadToolRow | undefined): string | null {
  return typeof row?.intent === 'string' && row.intent ? row.intent : null;
}

/**
 * One read of a thread's recent tool metadata, newest first, for every
 * projection that needs it.
 *
 * Selects the whole column rather than the four keys it needs, and deliberately
 * so: the two heavy fields ARE `searchResults` and `toolCalls` (8.000 characters
 * per scraped page, see postResponseService), so a `jsonb_build_object`
 * projection saves almost nothing while changing the row shape every test double
 * and the integration harness encode.
 *
 * Normalising a malformed row to `{}` here replaces the identical `JSON.parse`
 * guard the four projections each carried: they now simply find no key and keep
 * scanning older messages, exactly as before.
 */
async function readThreadToolRows(threadId: string): Promise<ThreadToolRows> {
  const postgres = getPostgresInstance();
  const rows = (await postgres.query(
    `SELECT tool_results,
            id = (SELECT last.id FROM chat_messages last
                  WHERE last.thread_id = $1 AND last.role = 'assistant' AND last.status = 'complete'
                  ORDER BY last.created_at DESC LIMIT 1) AS is_last_turn
     FROM chat_messages
     WHERE thread_id = $1 AND role = 'assistant' AND tool_results IS NOT NULL
     ORDER BY created_at DESC LIMIT ${WIDEST_ROW_WINDOW}`,
    [threadId]
  )) as Array<{ tool_results?: unknown; is_last_turn?: boolean | null }>;
  return {
    rows: rows.map((row) => {
      const raw = row.tool_results;
      if (!raw) return {};
      try {
        const meta: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return meta && typeof meta === 'object' ? (meta as ThreadToolRow) : {};
      } catch {
        return {}; // malformed row — skipped by every projection, scanning continues
      }
    }),
    newestIsLastTurn: rows[0]?.is_last_turn === true,
  };
}

/**
 * The rows skip assistant messages without metadata (an aborted turn, a HITL
 * confirm result), so the newest row is not necessarily the turn right before
 * this one. `newestIsLastTurn` says whether it is.
 */
interface ThreadToolRows {
  rows: ThreadToolRow[];
  newestIsLastTurn: boolean;
}

/**
 * A thread's tool memory, read once and projected many times. Hand this to
 * anything that would otherwise call two or three of the functions below in the
 * same turn — see `streamAgenticResponse`, which used to read twice while
 * `streamContext` had already read the very same rows.
 *
 * Safe to build at the start of a turn and use throughout it: the pending
 * assistant message carries `tool_results = NULL` until `finalizeAssistantMessage`
 * runs at the end, so the row set cannot change underneath it mid-turn.
 */
export interface ThreadToolHistory {
  artifacts(limit?: number): ThreadToolContext[];
  toolSteps(limit?: number): PersistedStep[];
  /** The tool steps of the assistant turn right before this one — empty when it ran none. */
  lastTurnToolSteps(): PersistedStep[];
  /** The artifact the assistant turn right before this one produced — empty when it made none. */
  lastTurnArtifacts(): ThreadToolContext[];
  /** The persisted intent of the assistant turn right before this one — null when unknown. */
  lastTurnIntent(): string | null;
  /** The artifact the assistant turn right before this one offered — null when none. */
  lastTurnOffer(): ArtifactKindId | null;
  /** The recipes the assistant turn right before this one loaded — empty when it loaded none. */
  lastTurnRecipes(): UsedRecipeRef[];
  sources(limit?: number): SearchResult[];
  lastGeneratedImageUrl(): string | null;
}

/**
 * This thread's completed user messages, oldest first — the source for
 * `backfillEmptyUserMessages`. Capped: only the tail can align with what a client
 * replays, and a long thread must not pull its whole history on every turn.
 */
export async function getUserMessageTexts(threadId: string, limit = 20): Promise<string[]> {
  const postgres = getPostgresInstance();
  const rows = await postgres.query(
    `SELECT content FROM chat_messages
     WHERE thread_id = $1 AND role = 'user' AND status = 'complete' AND content IS NOT NULL
     ORDER BY created_at DESC
     LIMIT $2`,
    [threadId, limit]
  );
  return rows.map((row) => row.content as string).reverse();
}

export async function readThreadToolHistory(threadId: string): Promise<ThreadToolHistory> {
  const { rows, newestIsLastTurn } = await readThreadToolRows(threadId);
  return {
    artifacts: (limit = 4) => toArtifacts(rows, limit),
    toolSteps: (limit = 6) => toToolSteps(rows, limit),
    lastTurnToolSteps: () =>
      newestIsLastTurn ? toToolSteps(rows.slice(0, 1), Number.MAX_SAFE_INTEGER) : [],
    lastTurnArtifacts: () =>
      newestIsLastTurn ? toArtifacts(rows.slice(0, 1), Number.MAX_SAFE_INTEGER) : [],
    lastTurnIntent: () => (newestIsLastTurn ? intentOf(rows[0]) : null),
    lastTurnOffer: () => (newestIsLastTurn ? parseRecordedOffer(rows[0]?.offer) : null),
    lastTurnRecipes: () => (newestIsLastTurn ? toRecipesUsed(rows[0]) : []),
    sources: (limit = 10) => toSources(rows, limit),
    lastGeneratedImageUrl: () => toLastGeneratedImageUrl(rows),
  };
}

/**
 * The artifacts a thread produced, newest first.
 *
 * `chat_threads.last_tool_context` holds ONE slot and every substantive turn
 * overwrites it, so a thread that made a document and then a sharepic has
 * forgotten the document — "kürze die Begründung auf die Hälfte" then finds no
 * deterministic door and falls through to the LLM tier, which sees only the
 * sharepic in its prose hint. This rebuilds the list from the same message
 * metadata the cards rehydrate from, so a follow-up can be matched against
 * everything the thread holds rather than just the newest thing in it.
 *
 * Extraction mirrors `deriveToolContext` (postResponseService), including its
 * precedence — one artifact per message, image before sharepic before document.
 * Kept in sync by construction: both read the metadata that function's inputs
 * are persisted into.
 */
export async function listThreadArtifacts(
  threadId: string,
  limit = 4
): Promise<ThreadToolContext[]> {
  return toArtifacts((await readThreadToolRows(threadId)).rows, limit);
}

/**
 * URL of the most recent generated image in the thread (assistant message
 * metadata `generatedImage.url`). Lets a vague follow-up ("mach es blauer")
 * rehydrate the previous result as the image_edit input instead of erroring
 * with "Bitte hänge ein Bild an".
 */
export async function getLastGeneratedImageUrl(threadId: string): Promise<string | null> {
  return toLastGeneratedImageUrl((await readThreadToolRows(threadId)).rows);
}

function toLastGeneratedImageUrl(rows: ThreadToolRow[]): string | null {
  for (const row of rows.slice(0, ROW_WINDOW.lastImage)) {
    const url = row.generatedImage?.url;
    if (typeof url === 'string' && url) return url;
  }
  return null;
}

/**
 * Recent tool steps of a thread, oldest → newest, for cross-turn replay.
 * Reads the `toolCalls` array persisted on each assistant message's
 * `tool_results` metadata (see createMessage). Returns ALL steps (MCP + search
 * + others); the caller decides which to replay (MCP filters on `serverName`,
 * search filters on tool name). Bounded so replay stays token-cheap.
 */
export async function getRecentToolSteps(threadId: string, limit = 6): Promise<PersistedStep[]> {
  return toToolSteps((await readThreadToolRows(threadId)).rows, limit);
}

/**
 * Recent search sources of a thread, for cross-turn REGISTRY rehydration.
 * Reads the `searchResults` array persisted on each assistant message's
 * `tool_results` metadata (see postResponseService) and returns them so a later
 * turn's source registry can be seeded with what earlier research gathered —
 * this is the grounding the op-planner (sheets/presentations/boards edit) needs
 * when the user says "trag die recherchierten Zahlen ein" turns after the search.
 *
 * Accumulates newest-first across the recent assistant messages until `limit`
 * is reached, deduped by URL+title — what the answers cited before the rest
 * (see `toSources`).
 *
 * It used to return at the FIRST message carrying any sources at all, which
 * made a single incidental lookup shadow the research before it: turn 5 does a
 * 10-source deep dive, turn 6 happens to fire one `umfragen` call, and turn 7
 * rehydrates exactly that one poll snippet while the deep dive is invisible.
 * "Recency" is now measured in sources, not in whichever message happened to
 * persist one.
 *
 * Still bounded: the SQL window caps how far back it looks, and `limit` caps the
 * result. Content is already snippet-sized at persist time, so this stays cheap.
 */
export async function getRecentThreadSources(
  threadId: string,
  limit = 10
): Promise<SearchResult[]> {
  return toSources((await readThreadToolRows(threadId)).rows, limit);
}

export interface ThreadSettings {
  custom_system_prompt: string | null;
  custom_enabled_tools: Record<string, boolean> | null;
  role_ref: RoleRef | null;
}

export async function getThreadSettings(threadId: string): Promise<ThreadSettings | null> {
  const postgres = getPostgresInstance();
  const result = await postgres.query(
    `SELECT custom_system_prompt, custom_enabled_tools, role_ref FROM chat_threads WHERE id = $1 AND deleted_at IS NULL`,
    [threadId]
  );
  if (!result[0]) return null;
  return {
    custom_system_prompt: (result[0].custom_system_prompt as string) || null,
    custom_enabled_tools: (result[0].custom_enabled_tools as Record<string, boolean>) || null,
    role_ref: (result[0].role_ref as RoleRef) || null,
  };
}

export async function updateThreadSettings(
  threadId: string,
  userId: string,
  settings: {
    customSystemPrompt?: string | null;
    customEnabledTools?: Record<string, boolean> | null;
    roleRef?: RoleRef | null;
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

  if (settings.roleRef !== undefined) {
    setClauses.push(`role_ref = $${paramIdx}`);
    params.push(settings.roleRef ? JSON.stringify(settings.roleRef) : null);
    paramIdx++;
  }

  params.push(threadId, userId);

  const result = await postgres.query(
    `UPDATE chat_threads SET ${setClauses.join(', ')} WHERE id = $${paramIdx} AND user_id = $${paramIdx + 1} RETURNING id`,
    params
  );
  return (result as unknown[]).length > 0;
}

/**
 * Thread Persistence Service
 *
 * Database operations for chat threads and messages.
 * Wraps PostgreSQL queries for thread CRUD and message storage.
 */

import { generateSlugSuffix } from '@gruenerator/shared/utils';

import { getPostgresInstance } from '../../../database/services/PostgresService.js';

import { type PersistedStep } from './agenticLoop/types.js';

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
): Promise<string> {
  const postgres = getPostgresInstance();
  const result = (await postgres.query(
    `INSERT INTO chat_messages (thread_id, role, content, tool_results, user_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [threadId, role, content, metadata ? JSON.stringify(metadata) : null, userId || null]
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
    [messageId, text]
  );
}

/**
 * Finalize the placeholder into a completed assistant message: set the final
 * content + tool_results metadata and flip status to 'complete'. Returns false
 * when no row matched (e.g. a regenerate from another tab deleted the row) —
 * the caller then skips a re-insert and only warns.
 */
export async function finalizeAssistantMessage(
  messageId: string,
  content: string | null,
  metadata?: Record<string, unknown>
): Promise<boolean> {
  const postgres = getPostgresInstance();
  const result = (await postgres.query(
    `UPDATE chat_messages
     SET content = $2, tool_results = $3, status = 'complete'
     WHERE id = $1
     RETURNING id`,
    [messageId, content, metadata ? JSON.stringify(metadata) : null]
  )) as unknown[];
  return result.length === 1;
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
 * Sticky MCP scope: the last connected server this thread's agentic loop was
 * scoped to. Read as the fallback when a follow-up names no server; written
 * (fire-and-forget) after a scoped MCP turn. A stale id (server since deleted)
 * simply resolves to no config → the loop falls back to the fan-out.
 */
export async function getThreadLastMcpServer(threadId: string): Promise<string | null> {
  const postgres = getPostgresInstance();
  const result = await postgres.query(`SELECT last_mcp_server_id FROM chat_threads WHERE id = $1`, [
    threadId,
  ]);
  return (result[0]?.last_mcp_server_id as string) || null;
}

export async function setThreadLastMcpServer(threadId: string, serverId: string): Promise<void> {
  const postgres = getPostgresInstance();
  await postgres.query(`UPDATE chat_threads SET last_mcp_server_id = $1 WHERE id = $2`, [
    serverId,
    threadId,
  ]);
}

/**
 * Generalised tool memory (see ThreadToolContext): which tool family the last
 * substantive turn used. Only written when a turn actually used one — plain
 * chat turns keep the previous context, mirroring the MCP sticky semantics.
 */
export async function getThreadToolContext(threadId: string): Promise<ThreadToolContext | null> {
  const postgres = getPostgresInstance();
  const result = await postgres.query(`SELECT last_tool_context FROM chat_threads WHERE id = $1`, [
    threadId,
  ]);
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
 * How deep each projection looks into the thread. Four functions used to run
 * the SAME query — `thread_id`, `role='assistant'`, `tool_results IS NOT NULL`,
 * newest first — differing in nothing but this number, and a single loop turn
 * fired three of them.
 *
 * The windows stay PER PROJECTION on purpose. The widest is read once and each
 * projection slices its own depth, so unifying the read does not quietly change
 * how far back replay or source rehydration reaches. Whether artifacts really
 * need 20 where sources get 12 is a product question; this is not the change
 * that answers it.
 */
const ROW_WINDOW = {
  artifacts: 20,
  toolSteps: 12,
  sources: 12,
  lastImage: 10,
} as const;

const WIDEST_ROW_WINDOW = Math.max(...Object.values(ROW_WINDOW));

/** The four `tool_results` keys the projections below read. */
interface ThreadToolRow extends ArtifactMetadataShape {
  searchResults?: unknown[] | null;
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
async function readThreadToolRows(threadId: string): Promise<ThreadToolRow[]> {
  const postgres = getPostgresInstance();
  const rows = (await postgres.query(
    `SELECT tool_results FROM chat_messages
     WHERE thread_id = $1 AND role = 'assistant' AND tool_results IS NOT NULL
     ORDER BY created_at DESC LIMIT ${WIDEST_ROW_WINDOW}`,
    [threadId]
  )) as Array<{ tool_results?: unknown }>;
  return rows.map((row) => {
    const raw = row.tool_results;
    if (!raw) return {};
    try {
      const meta: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return meta && typeof meta === 'object' ? (meta as ThreadToolRow) : {};
    } catch {
      return {}; // malformed row — skipped by every projection, scanning continues
    }
  });
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
  const rows = await readThreadToolRows(threadId);
  return {
    artifacts: (limit = 4) => toArtifacts(rows, limit),
    toolSteps: (limit = 6) => toToolSteps(rows, limit),
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
  return toArtifacts(await readThreadToolRows(threadId), limit);
}

function toArtifacts(rows: ThreadToolRow[], limit: number): ThreadToolContext[] {
  const artifacts: ThreadToolContext[] = [];
  const seen = new Set<string>();
  for (const row of rows.slice(0, ROW_WINDOW.artifacts)) {
    const artifact = artifactFromMessageMetadata(row);
    if (!artifact) continue;
    // Two turns editing the same document are one artifact. A sharepic carries
    // no stable id across turns, so its kind alone dedupes — the thread's
    // sharepic is a single editable thing, not one per refinement.
    const key = `${artifact.kind}:${artifact.ref ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    artifacts.push(artifact);
    if (artifacts.length >= limit) break;
  }
  return artifacts;
}

interface ArtifactMetadataShape {
  generatedImage?: { url?: string; prompt?: string } | null;
  createdDocument?: { documentId?: string; title?: string; subtype?: string } | null;
  toolCalls?: Array<{
    toolName?: string;
    result?: { variants?: Array<{ initialProps?: Record<string, unknown> }> };
  }> | null;
}

/** The one artifact an assistant message produced, or null for a plain turn. */
function artifactFromMessageMetadata(meta: unknown): ThreadToolContext | null {
  if (!meta || typeof meta !== 'object') return null;
  const m = meta as ArtifactMetadataShape;

  const imageUrl = m.generatedImage?.url;
  if (typeof imageUrl === 'string' && imageUrl) {
    return { kind: 'image', ref: imageUrl, label: labelOf(m.generatedImage?.prompt) };
  }

  const variant = m.toolCalls?.find((tc) => tc?.toolName === 'sharepic')?.result?.variants?.[0];
  if (variant) {
    const p = variant.initialProps ?? {};
    const text = [p['line1'], p['line2'] ?? p['accent'], p['line3'], p['quote'], p['header']]
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
      .join(' ');
    return { kind: 'sharepic', ref: null, label: labelOf(text) };
  }

  const doc = m.createdDocument;
  if (doc?.documentId) {
    const sub = doc.subtype ?? '';
    const kind = sub.startsWith('presentation')
      ? 'presentation'
      : sub.startsWith('sheet')
        ? 'sheet'
        : sub.startsWith('pdf')
          ? 'pdf'
          : 'document';
    return { kind, ref: doc.documentId, label: labelOf(doc.title) };
  }
  return null;
}

/** Short, single-line label for prompt injection; null when there is nothing to show. */
function labelOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean ? clean.slice(0, 60) : null;
}

/**
 * URL of the most recent generated image in the thread (assistant message
 * metadata `generatedImage.url`). Lets a vague follow-up ("mach es blauer")
 * rehydrate the previous result as the image_edit input instead of erroring
 * with "Bitte hänge ein Bild an".
 */
export async function getLastGeneratedImageUrl(threadId: string): Promise<string | null> {
  return toLastGeneratedImageUrl(await readThreadToolRows(threadId));
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
  return toToolSteps(await readThreadToolRows(threadId), limit);
}

function toToolSteps(rows: ThreadToolRow[], limit: number): PersistedStep[] {
  const steps: PersistedStep[] = [];
  for (const row of rows.slice(0, ROW_WINDOW.toolSteps)) {
    const calls = (Array.isArray(row.toolCalls) ? row.toolCalls : []) as PersistedStep[];
    for (const c of calls) {
      if (c && typeof c === 'object' && typeof (c as PersistedStep).toolName === 'string') {
        steps.push(c);
      }
    }
    if (steps.length >= limit) break;
  }
  return steps.slice(0, limit).reverse();
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
 * is reached, deduped by URL+title.
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
  return toSources(await readThreadToolRows(threadId), limit);
}

function toSources(rows: ThreadToolRow[], limit: number): SearchResult[] {
  const collected: SearchResult[] = [];
  const seen = new Set<string>();
  for (const row of rows.slice(0, ROW_WINDOW.sources)) {
    const results = (Array.isArray(row.searchResults) ? row.searchResults : []) as SearchResult[];
    for (const r of results) {
      if (!r || typeof r !== 'object') continue;
      if (typeof r.content !== 'string' || r.content.trim() === '') continue;
      const key = `${r.url ?? ''}::${r.title ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      collected.push(r);
      if (collected.length >= limit) return collected;
    }
  }
  return collected;
}

export interface ThreadSettings {
  custom_system_prompt: string | null;
  custom_enabled_tools: Record<string, boolean> | null;
  role_ref: { ebene: string; rolle: string } | null;
}

export async function getThreadSettings(threadId: string): Promise<ThreadSettings | null> {
  const postgres = getPostgresInstance();
  const result = await postgres.query(
    `SELECT custom_system_prompt, custom_enabled_tools, role_ref FROM chat_threads WHERE id = $1`,
    [threadId]
  );
  if (!result[0]) return null;
  return {
    custom_system_prompt: (result[0].custom_system_prompt as string) || null,
    custom_enabled_tools: (result[0].custom_enabled_tools as Record<string, boolean>) || null,
    role_ref: (result[0].role_ref as { ebene: string; rolle: string }) || null,
  };
}

export async function updateThreadSettings(
  threadId: string,
  userId: string,
  settings: {
    customSystemPrompt?: string | null;
    customEnabledTools?: Record<string, boolean> | null;
    roleRef?: { ebene: string; rolle: string } | null;
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

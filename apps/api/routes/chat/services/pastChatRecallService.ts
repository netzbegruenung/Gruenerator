/**
 * Past Work Recall Service
 *
 * Lets the assistant recall the user's OWN earlier work — both as start-of-chat
 * context (see chatGraphContractRouter) and as an explicit tool (the
 * `chat_history` intent). Two sources:
 *  - past chat conversations (`recallPastChats`): ILIKE `searchChatHistory`
 *    merged with thread-level semantic matches so a fresh first message can
 *    surface a topically related past thread even without shared keywords.
 *  - office content — docs, boards, sheets, presentations (`recallOfficeDocuments`):
 *    title + content-preview search over `collaborative_documents`, reusing
 *    `searchOfficeContent`.
 *  - reels — the user's subtitled videos (`recallReels`): title + spoken
 *    subtitle content, reusing `searchReels`.
 * `rerankRecall` then cross-ranks all three sources.
 *
 * This is deliberately separate from mem0 fact memory: mem0 stores distilled
 * facts about the user; this returns raw conversation excerpts and document
 * references with titles and dates the model can reference naturally.
 */

import { sanitizeMentionTokens } from '@gruenerator/shared/utils';

import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import { searchThreadRecall } from '../../../services/chat/threadRecallEmbeddingService.js';
import { rerankPipeline } from '../../../services/search/rerankPipeline.js';
import { type ReelHit, searchReels } from '../../../services/subtitler/reelSearch.js';
import { createLogger } from '../../../utils/logger.js';
import { toIsoOrNull, toIsoString } from '../../../utils/toIsoString.js';
import {
  officeKindLabel,
  officeSnippet,
  officeUrl,
  searchOfficeContent,
} from '../../docs/docsSearch.js';

import { searchChatHistory } from './chatSearchService.js';

import type { ChatSearchResult } from '../../../agents/langgraph/ChatGraph/types.js';

const log = createLogger('PastChatRecallService');

const DEEP_READ_MAX_MESSAGES = 10;
const DEEP_READ_MAX_CHARS = 4_000;

/**
 * Owned, regular thread ids filed into a Space (group_id) — the scope for
 * space-aware recall.
 *
 * Discriminated on purpose: an empty result used to be indistinguishable from a
 * DB error, and `recallPastChats` treats an empty scope as "search nothing" —
 * so a transient failure answered "dazu finde ich nichts" for a Space full of
 * chats. `ok: false` lets the caller fall back to unscoped recall instead of
 * silently searching an empty set.
 */
export type SpaceThreadIdsResult =
  { ok: true; threads: { id: string; title: string | null }[] } | { ok: false };

export async function resolveSpaceThreadIds(
  groupId: string,
  userId: string
): Promise<SpaceThreadIdsResult> {
  const db = getPostgresInstance();
  try {
    const rows = (await db.query(
      `SELECT id, title FROM chat_threads
       WHERE group_id = $1::uuid AND user_id = $2
         AND COALESCE(status, 'regular') = 'regular'
       ORDER BY updated_at DESC`,
      [groupId, userId]
    )) as Array<{ id: string; title: string | null }>;
    return { ok: true, threads: rows.map((r) => ({ id: r.id, title: r.title })) };
  } catch (err) {
    log.warn(`[Recall] resolveSpaceThreadIds failed: ${err}`);
    return { ok: false };
  }
}

/**
 * Space scope for the current thread: the sibling chats in the same Space plus a
 * roster block telling the model "this Space holds threads X, Y, Z — you can
 * search them with search_threads". Returns null when the thread isn't filed in
 * a Space (recall stays global). The current thread is excluded from the roster.
 */
export async function getSpaceRecallScope(
  threadId: string | null,
  userId: string
): Promise<{ spaceName: string; threadIds: string[]; rosterBlock: string } | null> {
  if (!threadId) return null;
  const db = getPostgresInstance();
  try {
    const rows = (await db.query(
      `SELECT g.id, g.name
       FROM chat_threads t
       JOIN groups g ON g.id = t.group_id
       WHERE t.id = $1::uuid AND t.user_id = $2 AND COALESCE(g.is_active, TRUE) = TRUE
       LIMIT 1`,
      [threadId, userId]
    )) as Array<{ id: string; name: string }>;
    if (rows.length === 0) return null;
    const space = rows[0];

    const siblingResult = await resolveSpaceThreadIds(space.id, userId);
    // Lookup failed (not "the Space is empty"): returning a scope of zero
    // threads would silently search nothing. Fall back to unscoped recall.
    if (!siblingResult.ok) return null;
    const siblings = siblingResult.threads.filter((s) => s.id !== threadId);
    const threadIds = siblings.map((s) => s.id);
    const list =
      siblings.length > 0
        ? siblings.map((s) => `- ${s.title || 'Unbenannter Chat'}`).join('\n')
        : '- (noch keine weiteren Chats)';
    const rosterBlock =
      `## SPACE: ${space.name}\n` +
      `Dieser Chat liegt im Projekt „${space.name}". Enthaltene weitere Chats:\n${list}\n` +
      `Du kannst diese gezielt mit dem Tool \`search_threads\` (scope="space") durchsuchen.`;
    return { spaceName: space.name, threadIds, rosterBlock };
  } catch (err) {
    log.warn(`[Recall] getSpaceRecallScope failed: ${err}`);
    return null;
  }
}

export interface OfficeDocHit {
  id: string;
  title: string | null;
  /** Underlying collaborative_documents.document_subtype. */
  subtype: string | null;
  /** German kind label (Dokument / Präsentation / Tabelle / Board). */
  kind: string;
  /** Short readable excerpt from the content preview (may be ''). */
  snippet: string;
  url: string;
  updatedAt: string | null;
}

/**
 * Search the user's own office content — docs, boards, sheets, presentations —
 * by title and content preview. Reuses `searchOfficeContent`, which applies the
 * owned/shared/group access predicate, so a user never sees another's content.
 */
export async function recallOfficeDocuments(
  userId: string,
  query: string,
  limit = 3
): Promise<OfficeDocHit[]> {
  if (!query.trim()) return [];
  try {
    const hits = await searchOfficeContent(userId, query, { limit });
    return hits.map((h) => ({
      id: h.id,
      title: h.title,
      subtype: h.document_subtype,
      kind: officeKindLabel(h.document_subtype),
      snippet: officeSnippet(h.document_subtype, h.content),
      url: officeUrl(h.document_subtype, h.id),
      updatedAt: toIsoOrNull(h.updated_at),
    }));
  } catch (err) {
    log.warn(`[Recall] Office content search failed: ${err}`);
    return [];
  }
}

/**
 * Search the user's own reels — subtitled videos — by title and by the spoken
 * subtitle content. Reuses `searchReels`, which is scoped to `user_id`; reels
 * have no group sharing, so ownership is the whole access rule.
 */
export async function recallReels(userId: string, query: string, limit = 3): Promise<ReelHit[]> {
  if (!query.trim()) return [];
  return searchReels(userId, query, limit);
}

const RERANK_SNIPPET_CHARS = 300;

/**
 * Cross-source relevance ranking of recall candidates (chats + office content +
 * reels) via the shared cross-encoder `rerankPipeline`, so the few most relevant
 * items survive regardless of source — instead of blindly injecting N of each.
 * Returns the kept subsets (rerank order preserved). Degrades to the inputs
 * (truncated to `keep`) when reranking is unavailable or the list is trivially
 * small.
 */
export async function rerankRecall(
  query: string,
  chats: ChatSearchResult[],
  officeDocs: OfficeDocHit[],
  keep: number,
  reels: ReelHit[] = []
): Promise<{ chats: ChatSearchResult[]; officeDocs: OfficeDocHit[]; reels: ReelHit[] }> {
  type Candidate =
    | { kind: 'chat'; hit: ChatSearchResult }
    | { kind: 'office'; hit: OfficeDocHit }
    | { kind: 'reel'; hit: ReelHit };
  const candidates: Candidate[] = [
    ...chats.map((hit) => ({ kind: 'chat' as const, hit })),
    ...officeDocs.map((hit) => ({ kind: 'office' as const, hit })),
    ...reels.map((hit) => ({ kind: 'reel' as const, hit })),
  ];

  const splitKept = (kept: Candidate[]) => ({
    chats: kept
      .filter((c): c is Extract<Candidate, { kind: 'chat' }> => c.kind === 'chat')
      .map((c) => c.hit),
    officeDocs: kept
      .filter((c): c is Extract<Candidate, { kind: 'office' }> => c.kind === 'office')
      .map((c) => c.hit),
    reels: kept
      .filter((c): c is Extract<Candidate, { kind: 'reel' }> => c.kind === 'reel')
      .map((c) => c.hit),
  });

  if (candidates.length <= 1 || !query.trim()) {
    return splitKept(candidates.slice(0, keep));
  }

  const items = candidates.map((c) => {
    if (c.kind === 'chat') {
      return {
        title: c.hit.threadTitle ?? 'Chat',
        content: (c.hit.snippet ?? '').slice(0, RERANK_SNIPPET_CHARS),
        source: 'chat',
      };
    }
    if (c.kind === 'reel') {
      return {
        title: c.hit.title,
        content: c.hit.snippet.slice(0, RERANK_SNIPPET_CHARS),
        source: 'reel',
      };
    }
    return {
      title: c.hit.title ?? c.hit.kind,
      content: c.hit.snippet.slice(0, RERANK_SNIPPET_CHARS),
      source: c.hit.subtype ?? 'office',
    };
  });

  try {
    const { rankedIndices } = await rerankPipeline({
      query,
      items,
      outputLimit: keep,
      instruct: 'Finde die eigenen Inhalte des Nutzers, die zur Anfrage am relevantesten sind.',
      sourceTagFn: (it) => {
        if (it.source === 'chat') return 'Chat';
        if (it.source === 'reel') return 'Reel';
        return 'Eigener Inhalt';
      },
    });
    return splitKept(rankedIndices.map((i) => candidates[i]));
  } catch (err) {
    log.warn(`[Recall] Rerank failed (using unranked order): ${err}`);
    return splitKept(candidates.slice(0, keep));
  }
}

export interface PastChatRecallOptions {
  excludeThreadId?: string;
  limit?: number;
  startDate?: Date;
  endDate?: Date;
  // Space scope: restrict recall to this set of thread ids (a space's chats).
  threadIds?: string[];
}

/**
 * Search the user's own past threads. Keyword (ILIKE) and — when Qdrant
 * thread-recall points exist — semantic results are merged, deduped by thread,
 * keyword-first (precise) then semantic extras (fills in when the query shares
 * no literal words with an old thread). Semantic failures degrade to ILIKE-only.
 */
export async function recallPastChats(
  userId: string,
  query: string,
  options: PastChatRecallOptions = {}
): Promise<ChatSearchResult[]> {
  const { excludeThreadId, limit = 3, startDate, endDate, threadIds } = options;

  // An empty space scope means "no threads to search" — short-circuit so a
  // space with no chats doesn't fall through to an unscoped global recall.
  if (threadIds && threadIds.length === 0) return [];

  // Best-effort like the semantic half below: `searchChatHistory` throws now
  // (so the thread-search ENDPOINT can answer 500 instead of "no hits"), but
  // inside a chat turn a transient DB error must degrade recall, not abort the
  // whole answer. The empty result then reads as "nothing recalled", which the
  // router surfaces via recall_degraded.
  const keywordPromise = searchChatHistory(userId, query, {
    ownedOnly: true,
    limit,
    ...(excludeThreadId != null && { excludeThreadId }),
    ...(startDate != null && { startDate }),
    ...(endDate != null && { endDate }),
    ...(threadIds != null && { threadIds }),
  }).catch((err: unknown) => {
    log.warn(`[Recall] Keyword thread search failed (recall degraded): ${err}`);
    return [] as Awaited<ReturnType<typeof searchChatHistory>>;
  });

  // Semantic is best-effort: a Qdrant/Mistral outage must never break recall.
  const semanticPromise = query.trim()
    ? searchThreadRecall(userId, query, limit, threadIds).catch((err) => {
        log.warn(`[Recall] Semantic thread search failed (using keyword only): ${err}`);
        return [] as string[];
      })
    : Promise.resolve<string[]>([]);

  const [keywordHits, semanticThreadIds] = await Promise.all([keywordPromise, semanticPromise]);

  const seen = new Set(keywordHits.map((h) => h.threadId));
  if (excludeThreadId) seen.add(excludeThreadId);

  const semanticOnlyIds = semanticThreadIds.filter((id) => !seen.has(id));
  const semanticHits =
    semanticOnlyIds.length > 0 ? await hydrateThreadsAsResults(userId, semanticOnlyIds) : [];

  return [...keywordHits, ...semanticHits].slice(0, limit);
}

/**
 * The user's most recently active threads, no query needed — backs the
 * search_threads no-query path ("worüber haben wir zuletzt gechattet"). Same
 * result shape as recallPastChats; recency replaces relevance as the ranking.
 */
export async function listRecentThreads(
  userId: string,
  options: { limit?: number; excludeThreadId?: string; threadIds?: string[] } = {}
): Promise<ChatSearchResult[]> {
  const { limit = 5, excludeThreadId, threadIds } = options;

  // An empty space scope means "no threads to list" — mirror recallPastChats.
  if (threadIds && threadIds.length === 0) return [];

  const db = getPostgresInstance();
  try {
    const params: unknown[] = [userId];
    const where = [`user_id = $1`, `COALESCE(status, 'regular') = 'regular'`];
    if (excludeThreadId) {
      params.push(excludeThreadId);
      where.push(`id <> $${params.length}::uuid`);
    }
    if (threadIds) {
      params.push(threadIds);
      where.push(`id = ANY($${params.length}::uuid[])`);
    }
    params.push(limit);
    const rows = (await db.query(
      `SELECT id FROM chat_threads
       WHERE ${where.join(' AND ')}
       ORDER BY updated_at DESC
       LIMIT $${params.length}`,
      params
    )) as Array<{ id: string }>;
    if (rows.length === 0) return [];
    return await hydrateThreadsAsResults(
      userId,
      rows.map((r) => r.id)
    );
  } catch (err) {
    log.warn(`[Recall] listRecentThreads failed: ${err}`);
    return [];
  }
}

/**
 * Deep-read a single thread for the tool path: its compaction summary if one
 * exists, else the last N user/assistant messages. Ownership is enforced with
 * the same predicate as the owned-only search.
 */
export async function getThreadRecallContext(
  threadId: string,
  userId: string,
  opts: { maxMessages?: number; maxChars?: number } = {}
): Promise<{ title: string | null; updatedAt: string; transcript: string } | null> {
  const { maxMessages = DEEP_READ_MAX_MESSAGES, maxChars = DEEP_READ_MAX_CHARS } = opts;
  const db = getPostgresInstance();

  try {
    const threadRows = (await db.query(
      `SELECT title, updated_at, compaction_summary
       FROM chat_threads
       WHERE id = $1::uuid
         AND (user_id = $2 OR permissions ? $2::text)
         AND COALESCE(status, 'regular') = 'regular'`,
      [threadId, userId]
    )) as Array<{
      title: string | null;
      updated_at: Date | string;
      compaction_summary: string | null;
    }>;

    if (threadRows.length === 0) return null;
    const thread = threadRows[0];

    let transcript: string;
    if (thread.compaction_summary?.trim()) {
      transcript = thread.compaction_summary.trim().slice(0, maxChars);
    } else {
      const messageRows = (await db.query(
        `SELECT role, content
         FROM chat_messages
         WHERE thread_id = $1::uuid
           AND role IN ('user', 'assistant')
           AND content IS NOT NULL
         ORDER BY created_at DESC
         LIMIT $2`,
        [threadId, maxMessages]
      )) as Array<{ role: string; content: string }>;

      // The rows arrive newest-first; `.reverse()` restores reading order, so a
      // head-slice would keep the OLDEST part of the excerpt and drop the most
      // recent exchange — the exact opposite of what "was hatten wir zuletzt
      // beschlossen?" needs. Keep the TAIL instead.
      const ordered = messageRows
        .reverse()
        .map((m) => `[${m.role}] ${m.content}`)
        .join('\n');
      transcript =
        ordered.length > maxChars ? `…\n${ordered.slice(ordered.length - maxChars)}` : ordered;
    }

    return {
      title: thread.title,
      updatedAt: toIsoString(thread.updated_at),
      transcript,
    };
  } catch (err) {
    log.warn(`[Recall] Deep-read failed for thread ${threadId}: ${err}`);
    return null;
  }
}

/**
 * German system-prompt block shared by the start-of-chat injection and the
 * `chat_history` tool. Framed so the model treats these as PAST conversations
 * (with dates + titles) it may reference, not as citable sources.
 */
export function formatPastChatsBlock(
  results: ChatSearchResult[],
  deepRead?: { title: string | null; transcript: string } | null
): string {
  const lines: string[] = [
    '## RELEVANTE VERGANGENE GESPRÄCHE (KONTEXT – KEINE QUELLEN, NICHT ZITIEREN)',
    '',
    'Dies sind Auszüge aus früheren Chats des Nutzers mit dir. Du darfst dich darauf',
    'beziehen ("In unserem Gespräch vom 12.03. hatten wir…"), aber nur wenn es zur',
    'aktuellen Anfrage passt. Erfinde keine Details, die über die Auszüge hinausgehen.',
    '',
  ];

  for (const r of results) {
    const title = r.threadTitle?.trim() || 'Unbenannter Chat';
    const date = formatGermanDate(r.threadUpdatedAt);
    lines.push(`### „${title}" (Gespräch vom ${date})`);
    lines.push(`[${r.messageRole}] ${r.snippet}`);
    lines.push('');
  }

  if (deepRead?.transcript?.trim()) {
    const title = deepRead.title?.trim() || 'Unbenannter Chat';
    lines.push(`#### Vollständiger Verlauf des relevantesten Gesprächs „${title}":`);
    lines.push(deepRead.transcript.trim());
  }

  return lines.join('\n').trimEnd();
}

/**
 * German system-prompt block listing the user's own office documents (docs,
 * presentations, sheets) that match. Same framing as the chats block — context
 * the model may reference, not a citable source. Returns '' when empty so the
 * caller can drop it from the combined context.
 */
export function formatOfficeDocsBlock(docs: OfficeDocHit[]): string {
  if (docs.length === 0) return '';
  const lines: string[] = [
    '## RELEVANTE EIGENE INHALTE (KONTEXT – KEINE QUELLEN, NICHT ZITIEREN)',
    '',
    'Diese Dokumente, Präsentationen, Tabellen und Boards hat der Nutzer selbst erstellt.',
    'Du darfst darauf verweisen, wenn es zur Anfrage passt.',
    '',
  ];
  for (const d of docs) {
    const title = d.title?.trim() || 'Unbenanntes Dokument';
    const meta = d.updatedAt ? `${d.kind}, ${formatGermanDate(d.updatedAt)}` : d.kind;
    lines.push(`- „${title}" (${meta})`);
  }
  return lines.join('\n').trimEnd();
}

/**
 * German system-prompt block listing the user's own matching reels together
 * with the transcript lines that matched. Unlike the docs block this carries
 * actual spoken content, because the common follow-up ("schreib mir eine
 * Caption dazu") has to work from what is said in the video — same framing
 * though: context to work from, not a citable source. Returns '' when empty.
 */
export function formatReelsBlock(reels: ReelHit[]): string {
  if (reels.length === 0) return '';
  const lines: string[] = [
    '## RELEVANTE EIGENE REELS (KONTEXT – KEINE QUELLEN, NICHT ZITIEREN)',
    '',
    'Das sind untertitelte Videos des Nutzers. Die Zeilen darunter sind Auszüge aus dem',
    'gesprochenen Untertitel-Transkript (Zeitstempel in Klammern). Du darfst darauf',
    'aufbauen — etwa für eine Caption — und dich auf Zeitmarken beziehen. Erfinde nichts,',
    'was nicht im Transkript steht.',
    '',
  ];
  for (const r of reels) {
    const meta = r.lastEditedAt
      ? `Reel, zuletzt bearbeitet ${formatGermanDate(r.lastEditedAt)}`
      : 'Reel';
    lines.push(`### „${r.title}" (${meta})`);
    lines.push(r.snippet || '(keine Untertitel vorhanden)');
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

function formatGermanDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unbekannt';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

/**
 * Turn semantic-only thread ids into ChatSearchResult rows: thread metadata plus
 * the most recent user/assistant message as a snippet. Preserves the semantic
 * ranking order of the incoming ids.
 */
async function hydrateThreadsAsResults(
  userId: string,
  threadIds: string[]
): Promise<ChatSearchResult[]> {
  const db = getPostgresInstance();

  try {
    const rows = (await db.query(
      `SELECT
         t.id AS thread_id,
         t.title AS thread_title,
         t.agent_id,
         t.slug_suffix AS thread_slug_suffix,
         t.updated_at AS thread_updated_at,
         t.compaction_summary,
         (
           SELECT m.content FROM chat_messages m
           WHERE m.thread_id = t.id AND m.role IN ('user', 'assistant') AND m.content IS NOT NULL
           ORDER BY m.created_at DESC LIMIT 1
         ) AS snippet_content
       FROM chat_threads t
       WHERE t.id = ANY($1::uuid[])
         AND (t.user_id = $2 OR t.permissions ? $2::text)
         AND COALESCE(t.status, 'regular') = 'regular'`,
      [threadIds, userId]
    )) as Array<{
      thread_id: string;
      thread_title: string | null;
      agent_id: string;
      thread_slug_suffix: string | null;
      thread_updated_at: Date | string;
      compaction_summary: string | null;
      snippet_content: string | null;
    }>;

    const byId = new Map(rows.map((r) => [r.thread_id, r]));

    return threadIds
      .map((id) => byId.get(id))
      .filter((r): r is NonNullable<typeof r> => r != null)
      .map((r) => ({
        threadId: r.thread_id,
        threadTitle: r.thread_title,
        threadSlugSuffix: r.thread_slug_suffix,
        agentId: r.agent_id,
        // Stored content may carry durable mention tokens — show the label form.
        snippet: sanitizeMentionTokens(
          r.snippet_content || r.compaction_summary || r.thread_title || '',
          'label'
        ).slice(0, 200),
        messageRole: 'assistant' as const,
        matchedAt: toIsoString(r.thread_updated_at),
        threadUpdatedAt: toIsoString(r.thread_updated_at),
      }));
  } catch (err) {
    log.warn(`[Recall] Hydration of semantic hits failed: ${err}`);
    return [];
  }
}

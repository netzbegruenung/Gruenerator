/**
 * Thread Recall Embedding Service (Phase B)
 *
 * One Qdrant point per thread, built from title + tags + first user message +
 * compaction summary, so a new chat's first message can surface a topically
 * related past thread even without shared keywords. Points are written
 * fire-and-forget after the first exchange (title/tag generation) and re-written
 * after compaction. Retrieval is per-user (payload filter) and merged with the
 * ILIKE keyword search in `recallPastChats`.
 *
 * Reuses the existing embedding backend (mistral-embed, 1024 dims) and the
 * declarative Qdrant collection defined in `qdrantCollectionsSchema.ts`.
 */

import * as crypto from 'crypto';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { getQdrantInstance } from '../../database/services/QdrantService/index.js';
import { QdrantOperations } from '../../database/services/QdrantService/operations/index.js';
import { createLogger } from '../../utils/logger.js';
import { mistralEmbeddingService } from '../mistral/index.js';

import type { QdrantFilter } from '../../database/services/QdrantService/types.js';

const log = createLogger('ThreadRecallEmbedding');

export const CHAT_THREAD_RECALL_COLLECTION = 'chat_thread_recall';

const EMBED_INPUT_MAX_CHARS = 1_500;
const SEMANTIC_SCORE_THRESHOLD = 0.5;

/** Stable 52-bit numeric point id from the thread UUID (Qdrant points need numeric ids). */
function threadPointId(threadId: string): number {
  const hash = crypto.createHash('sha256').update(threadId).digest('hex');
  return parseInt(hash.substring(0, 13), 16);
}

async function getOps(): Promise<QdrantOperations> {
  const qdrant = getQdrantInstance();
  await qdrant.init();
  return new QdrantOperations(qdrant.client!);
}

interface ThreadRecallRow {
  user_id: string;
  title: string | null;
  thread_type: string | null;
  tags: unknown;
  compaction_summary: string | null;
  updated_at: Date | string;
  first_message: string | null;
}

/**
 * Embed (or re-embed) a single thread into the recall collection. Idempotent:
 * the point id is derived from the thread id, so repeated calls overwrite.
 * No-op for threads with nothing meaningful to embed yet.
 */
export async function upsertThreadRecallPoint(threadId: string): Promise<void> {
  const db = getPostgresInstance();

  const rows = (await db.query(
    `SELECT
       t.user_id,
       t.title,
       t.thread_type,
       t.tags,
       t.compaction_summary,
       t.updated_at,
       (
         SELECT m.content FROM chat_messages m
         WHERE m.thread_id = t.id AND m.role = 'user' AND m.content IS NOT NULL
         ORDER BY m.created_at ASC LIMIT 1
       ) AS first_message
     FROM chat_threads t
     WHERE t.id = $1::uuid AND COALESCE(t.status, 'regular') = 'regular'`,
    [threadId]
  )) as ThreadRecallRow[];

  if (rows.length === 0) return;
  const row = rows[0];

  const tags = Array.isArray(row.tags) ? (row.tags as string[]).join(', ') : '';
  const parts = [
    row.title ?? '',
    tags ? `Themen: ${tags}` : '',
    row.first_message ?? '',
    row.compaction_summary ?? '',
  ].filter((p) => p.trim());

  const text = parts.join('\n').slice(0, EMBED_INPUT_MAX_CHARS).trim();
  if (!text) return;

  await mistralEmbeddingService.init();
  const vector = await mistralEmbeddingService.generateEmbedding(text);

  const updatedAt =
    row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at);

  const ops = await getOps();
  await ops.batchUpsert(CHAT_THREAD_RECALL_COLLECTION, [
    {
      id: threadPointId(threadId),
      vector,
      payload: {
        thread_id: threadId,
        user_id: row.user_id,
        thread_type: row.thread_type ?? 'chat',
        title: row.title ?? null,
        updated_at: updatedAt,
      },
    },
  ]);

  log.info(`[ThreadRecall] Upserted recall point for thread ${threadId}`);
}

/** Remove a thread's recall point (call from the thread-delete handler). */
export async function deleteThreadRecallPoint(threadId: string): Promise<void> {
  try {
    const ops = await getOps();
    const filter: QdrantFilter = { must: [{ key: 'thread_id', match: { value: threadId } }] };
    await ops.batchDelete(CHAT_THREAD_RECALL_COLLECTION, filter);
  } catch (err) {
    log.warn(`[ThreadRecall] Delete failed for thread ${threadId}: ${err}`);
  }
}

/**
 * Semantic search over the user's own threads. Returns matching thread ids in
 * descending relevance. Throws on Qdrant/Mistral failure so the caller can fall
 * back to keyword-only.
 */
export async function searchThreadRecall(
  userId: string,
  query: string,
  limit: number,
  threadIds?: string[]
): Promise<string[]> {
  await mistralEmbeddingService.init();
  const vector = await mistralEmbeddingService.generateQueryEmbedding(query);

  const ops = await getOps();
  const filter: QdrantFilter = { must: [{ key: 'user_id', match: { value: userId } }] };
  // Space scope: restrict to a specific set of thread ids (indexed keyword).
  if (threadIds && threadIds.length > 0) {
    filter.must!.push({ key: 'thread_id', match: { any: threadIds } });
  }
  const hits = await ops.vectorSearch(CHAT_THREAD_RECALL_COLLECTION, vector, filter, {
    limit,
    threshold: SEMANTIC_SCORE_THRESHOLD,
  });

  return hits
    .map((h) => (h.payload?.thread_id as string | undefined) ?? null)
    .filter((id): id is string => typeof id === 'string');
}

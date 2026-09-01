/**
 * The two stores behind the user's explicit memory.
 *
 * Postgres (`user_memories`) is the source of truth — every list, every export,
 * every "Nr. 3" the model addresses comes from here. Qdrant (`user_memories`
 * collection) only mirrors `kind = 'fakt'` rows so that a person with many
 * facts gets the ones that fit the question; instructions never go there
 * because they are always in the prompt. A missing vector therefore costs
 * retrieval, never the memory itself.
 *
 * Both halves are behind small interfaces so `memoryService` and the loop tool
 * can be exercised against in-memory fakes.
 */
import * as crypto from 'crypto';

import { and, asc, eq, sql } from 'drizzle-orm';

import { user_memories, type UserMemoryRow } from '../../database/schema/index.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { getQdrantInstance } from '../../database/services/QdrantService/index.js';
import { QdrantOperations } from '../../database/services/QdrantService/operations/index.js';
import { createLogger } from '../../utils/logger.js';
import { mistralEmbeddingService } from '../mistral/index.js';

import type { QdrantFilter } from '../../database/services/QdrantService/types.js';
import type { MemoryKind, MemorySource } from '@gruenerator/contracts';

const log = createLogger('MemoryStore');

/** Same collection the mem0 layer used. Its old points carry no `kind`
 *  payload, so every filter below excludes them for free; a one-off script
 *  (`scripts/dropLegacyMem0Points.ts`) removes them for good. */
export const USER_MEMORIES_COLLECTION = 'user_memories';

const FACT_SCORE_THRESHOLD = 0.3;

export interface NewMemory {
  userId: string;
  kind: MemoryKind;
  text: string;
  source: MemorySource;
  threadId: string | null;
}

export interface MemoryDb {
  /** All rows of the person, oldest first — the order the prompt numbers them in. */
  list(userId: string): Promise<UserMemoryRow[]>;
  /** Exact-text duplicate (case- and whitespace-insensitive), or null. */
  findByText(userId: string, normalizedText: string): Promise<UserMemoryRow | null>;
  insert(row: NewMemory): Promise<UserMemoryRow>;
  /** Null when the row is not the person's (fail closed, never someone else's). */
  update(userId: string, id: string, text: string): Promise<UserMemoryRow | null>;
  remove(userId: string, id: string): Promise<UserMemoryRow | null>;
  removeAll(userId: string): Promise<number>;
}

export interface MemoryVectors {
  upsert(row: UserMemoryRow): Promise<void>;
  remove(id: string): Promise<void>;
  removeAll(userId: string): Promise<void>;
  /** Ids of the person's facts closest to the query, best first. */
  search(userId: string, query: string, limit: number): Promise<string[]>;
}

/** What the dedup compares: trimmed, single-spaced, case-folded. */
export function normalizeMemoryText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

export const drizzleMemoryDb: MemoryDb = {
  async list(userId) {
    const db = getDrizzleInstance();
    return db
      .select()
      .from(user_memories)
      .where(eq(user_memories.user_id, userId))
      .orderBy(asc(user_memories.created_at));
  },
  async findByText(userId, normalizedText) {
    const db = getDrizzleInstance();
    const rows = await db
      .select()
      .from(user_memories)
      .where(
        and(
          eq(user_memories.user_id, userId),
          sql`lower(regexp_replace(btrim(${user_memories.text}), '\s+', ' ', 'g')) = ${normalizedText}`
        )
      )
      .limit(1);
    return rows[0] ?? null;
  },
  async insert(row) {
    const db = getDrizzleInstance();
    const [inserted] = await db
      .insert(user_memories)
      .values({
        user_id: row.userId,
        kind: row.kind,
        text: row.text,
        source: row.source,
        thread_id: row.threadId,
      })
      .returning();
    return inserted;
  },
  async update(userId, id, text) {
    const db = getDrizzleInstance();
    const [updated] = await db
      .update(user_memories)
      .set({ text, updated_at: new Date() })
      .where(and(eq(user_memories.user_id, userId), eq(user_memories.id, id)))
      .returning();
    return updated ?? null;
  },
  async remove(userId, id) {
    const db = getDrizzleInstance();
    const [removed] = await db
      .delete(user_memories)
      .where(and(eq(user_memories.user_id, userId), eq(user_memories.id, id)))
      .returning();
    return removed ?? null;
  },
  async removeAll(userId) {
    const db = getDrizzleInstance();
    const removed = await db
      .delete(user_memories)
      .where(eq(user_memories.user_id, userId))
      .returning({ id: user_memories.id });
    return removed.length;
  },
};

/** Stable 52-bit numeric point id from the memory UUID (Qdrant wants numbers). */
function pointId(memoryId: string): number {
  const hash = crypto.createHash('sha256').update(memoryId).digest('hex');
  return parseInt(hash.substring(0, 13), 16);
}

async function ops(): Promise<QdrantOperations> {
  const qdrant = getQdrantInstance();
  await qdrant.init();
  return new QdrantOperations(qdrant.client!);
}

export const qdrantMemoryVectors: MemoryVectors = {
  async upsert(row) {
    await mistralEmbeddingService.init();
    const vector = await mistralEmbeddingService.generateEmbedding(row.text);
    const q = await ops();
    await q.batchUpsert(USER_MEMORIES_COLLECTION, [
      {
        id: pointId(row.id),
        vector,
        payload: { memory_id: row.id, user_id: row.user_id, kind: row.kind, text: row.text },
      },
    ]);
  },
  async remove(id) {
    const q = await ops();
    const filter: QdrantFilter = { must: [{ key: 'memory_id', match: { value: id } }] };
    await q.batchDelete(USER_MEMORIES_COLLECTION, filter);
  },
  async removeAll(userId) {
    const q = await ops();
    // No `kind` clause on purpose: this also sweeps the person's legacy mem0
    // points, which is exactly what "alle Erinnerungen löschen" promises.
    const filter: QdrantFilter = { must: [{ key: 'user_id', match: { value: userId } }] };
    await q.batchDelete(USER_MEMORIES_COLLECTION, filter);
  },
  async search(userId, query, limit) {
    await mistralEmbeddingService.init();
    const vector = await mistralEmbeddingService.generateQueryEmbedding(query);
    const q = await ops();
    const filter: QdrantFilter = {
      must: [
        { key: 'user_id', match: { value: userId } },
        { key: 'kind', match: { value: 'fakt' } },
      ],
    };
    const hits = await q.vectorSearch(USER_MEMORIES_COLLECTION, vector, filter, {
      limit,
      threshold: FACT_SCORE_THRESHOLD,
    });
    const ids = hits
      .map((h) => (h.payload?.memory_id as string | undefined) ?? null)
      .filter((id): id is string => typeof id === 'string');
    log.debug(`[Memory] fact search: ${ids.length}/${limit} hits`);
    return ids;
  },
};

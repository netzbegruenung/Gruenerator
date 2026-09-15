import { type MemoryKind, type MemorySource } from '@gruenerator/contracts';
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import type { InferSelectModel } from 'drizzle-orm';

/**
 * The person's explicit memory. Postgres is the source of truth; Qdrant only
 * mirrors `kind = 'fakt'` rows for retrieval (see services/memory/memoryStore.ts).
 * DDL lives in database/postgres/migrations/zz_20260901_user_memories.sql.
 */
export const user_memories = pgTable('user_memories', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull(),
  // Text column with a CHECK in SQL; narrowed here so callers get the union.
  kind: text('kind').$type<MemoryKind>().notNull(),
  text: text('text').notNull(),
  source: text('source').$type<MemorySource>().notNull(),
  thread_id: uuid('thread_id'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type UserMemoryRow = InferSelectModel<typeof user_memories>;

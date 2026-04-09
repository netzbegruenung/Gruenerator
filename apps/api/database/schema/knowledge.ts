import { boolean, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const userKnowledge = pgTable('user_knowledge', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  knowledge_type: text('knowledge_type').notNull().default('general'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  tags: jsonb('tags').$type<Record<string, unknown>[]>(),
  is_active: boolean('is_active').notNull().default(true),
  embedding_id: text('embedding_id'),
  embedding_hash: text('embedding_hash'),
  vector_indexed_at: timestamp('vector_indexed_at', { withTimezone: true }),
});

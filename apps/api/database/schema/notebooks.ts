import { type InferSelectModel } from 'drizzle-orm';
import { boolean, inet, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const notebook_collections = pgTable('notebook_collections', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id'),
  name: text('name').notNull(),
  description: text('description'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  is_active: boolean('is_active').default(true),
  settings: jsonb('settings').$type<Record<string, unknown>>().default({}),
  document_count: integer('document_count').default(0),
  last_used_at: timestamp('last_used_at', { withTimezone: true }),
});

export const notebook_collection_documents = pgTable('notebook_collection_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  collection_id: uuid('collection_id'),
  document_id: uuid('document_id'),
  added_at: timestamp('added_at', { withTimezone: true }).defaultNow(),
  added_by: uuid('added_by'),
});

export const notebook_public_access = pgTable('notebook_public_access', {
  id: uuid('id').primaryKey().defaultRandom(),
  collection_id: uuid('collection_id'),
  access_token: text('access_token').notNull().unique(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  expires_at: timestamp('expires_at', { withTimezone: true }),
  created_by: uuid('created_by'),
  is_active: boolean('is_active').default(true),
});

export const notebook_usage_logs = pgTable('notebook_usage_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  collection_id: uuid('collection_id'),
  user_id: uuid('user_id'),
  question: text('question').notNull(),
  answer_length: integer('answer_length'),
  response_time_ms: integer('response_time_ms'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  ip_address: inet('ip_address'),
  user_agent: text('user_agent'),
});

export type NotebookCollection = InferSelectModel<typeof notebook_collections>;
export type NotebookCollectionDocument = InferSelectModel<typeof notebook_collection_documents>;
export type NotebookPublicAccess = InferSelectModel<typeof notebook_public_access>;
export type NotebookUsageLog = InferSelectModel<typeof notebook_usage_logs>;

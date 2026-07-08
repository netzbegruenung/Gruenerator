import { type InferSelectModel } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const chatThreads = pgTable(
  'chat_threads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id'),
    agent_id: varchar('agent_id', { length: 100 }).notNull().default('gruenerator-universal'),
    title: varchar('title', { length: 255 }),
    status: varchar('status', { length: 20 }).default('regular'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    permissions: jsonb('permissions').$type<Record<string, unknown>>().default({}),
    is_public: boolean('is_public').default(false),
    compaction_summary: text('compaction_summary'),
    compacted_up_to_message_id: uuid('compacted_up_to_message_id'),
    compaction_updated_at: timestamp('compaction_updated_at', { withTimezone: true }),
    thread_type: varchar('thread_type', { length: 20 }).default('chat'),
    custom_system_prompt: text('custom_system_prompt'),
    custom_enabled_tools: jsonb('custom_enabled_tools').$type<Record<string, unknown>>(),
    notebook_collection_id: varchar('notebook_collection_id', { length: 255 }),
    notebook_collection_ids: jsonb('notebook_collection_ids').$type<string[]>(),
    doc_id: uuid('doc_id'),
    // Auto-generated + user-editable topic tags for sidebar filtering/search.
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    // Stable 6-char key for Notion-style thread URLs (/chat/<titel>-<suffix>).
    slug_suffix: text('slug_suffix'),
  },
  (t) => [index('idx_chat_threads_tags').using('gin', t.tags)]
);

export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  thread_id: uuid('thread_id'),
  role: varchar('role', { length: 20 }).notNull(),
  user_id: uuid('user_id'),
  content: text('content'),
  tool_calls: jsonb('tool_calls').$type<Record<string, unknown>[]>(),
  tool_results: jsonb('tool_results').$type<Record<string, unknown>[]>(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const chatThreadAttachments = pgTable('chat_thread_attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  thread_id: uuid('thread_id'),
  message_id: uuid('message_id'),
  user_id: uuid('user_id').notNull(),
  name: text('name').notNull(),
  mime_type: text('mime_type').notNull(),
  size_bytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  is_image: boolean('is_image').default(false),
  extracted_text: text('extracted_text'),
  summary: text('summary'),
  // Raw file bytes (base64) for tabular attachments only — lets the in-browser
  // pandas interpreter be rehydrated after a thread reload / on another device.
  file_data: text('file_data'),
  // Qdrant document id when a large prose doc was chunked+embedded — follow-up
  // turns retrieve it via RAG instead of re-injecting its truncated full text.
  document_id: uuid('document_id'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

/**
 * Maps chat sharepic variants to their lazily-minted canvas documents.
 * `is_active` marks the variant the sharepic_edit intent targets when no
 * explicit currentSharepic selection arrives with the request. Mirrors
 * `migrations/create_chat_thread_canvases.sql`.
 */
export const chatThreadCanvases = pgTable('chat_thread_canvases', {
  id: uuid('id').primaryKey().defaultRandom(),
  thread_id: uuid('thread_id').notNull(),
  variant_id: text('variant_id').notNull(),
  canvas_id: uuid('canvas_id').notNull(), // FK → collaborative_documents.id (ON DELETE CASCADE)
  canvas_type: text('canvas_type').notNull(),
  is_active: boolean('is_active').notNull().default(false),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

/**
 * Maps chat threads to the subtitler projects ("reels") edited in them.
 * `is_active` marks the project the reel_edit branch targets when no
 * explicit currentReel selection arrives with the request. Mirrors
 * `migrations/create_chat_thread_reels.sql`.
 */
export const chatThreadReels = pgTable('chat_thread_reels', {
  id: uuid('id').primaryKey().defaultRandom(),
  thread_id: uuid('thread_id').notNull(),
  project_id: uuid('project_id').notNull(), // FK → subtitler_projects.id (ON DELETE CASCADE)
  is_active: boolean('is_active').notNull().default(false),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export type ChatThread = InferSelectModel<typeof chatThreads>;
export type ChatMessage = InferSelectModel<typeof chatMessages>;
export type ChatThreadAttachment = InferSelectModel<typeof chatThreadAttachments>;
export type ChatThreadCanvas = InferSelectModel<typeof chatThreadCanvases>;
export type ChatThreadReel = InferSelectModel<typeof chatThreadReels>;

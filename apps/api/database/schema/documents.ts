import { type InferSelectModel } from 'drizzle-orm';
import { bigint, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id'),
  title: text('title').notNull(),
  filename: text('filename'),
  file_path: text('file_path'),
  file_size: bigint('file_size', { mode: 'number' }).default(0),
  page_count: integer('page_count').default(0),
  status: text('status').default('pending'),
  ocr_text: text('ocr_text'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  ocr_method: text('ocr_method').default('tesseract'),
  source_url: text('source_url'),
  document_type: text('document_type').default('upload'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  markdown_content: text('markdown_content'),
  group_id: uuid('group_id'),
  source_type: text('source_type').default('manual'),
  wolke_share_link_id: text('wolke_share_link_id'),
  wolke_file_path: text('wolke_file_path'),
  wolke_etag: text('wolke_etag'),
  vector_count: integer('vector_count').default(0),
  last_synced_at: timestamp('last_synced_at', { withTimezone: true }),
  group_wolke_share_id: text('group_wolke_share_id'),
});

export type Document = InferSelectModel<typeof documents>;

import { type InferSelectModel } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * 1:1 sidecar for canvas documents. ACL/Yjs/sharing reuse the
 * `collaborative_documents` pipeline (document_subtype='canvas'); only
 * canvas-specific columns live here. Mirrors the runtime DDL in
 * `database/postgres/migrations/add_canvas_documents.sql` (+ `_format.sql`).
 */
export const canvasDocuments = pgTable(
  'canvas_documents',
  {
    document_id: uuid('document_id').primaryKey(), // FK → collaborative_documents.id (ON DELETE CASCADE)
    template_type: text('template_type').notNull(),
    base_template_id: text('base_template_id'),
    thumbnail_url: text('thumbnail_url'),
    page_count: integer('page_count').notNull().default(1),
    initial_state: jsonb('initial_state').$type<Record<string, unknown>>().notNull().default({}),
    format: text('format').notNull().default('post-portrait'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('idx_canvas_documents_template_type').on(t.template_type),
    index('idx_canvas_documents_format').on(t.format),
  ]
);

export type CanvasDocumentSidecarRow = InferSelectModel<typeof canvasDocuments>;

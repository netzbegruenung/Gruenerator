import { type InferSelectModel } from 'drizzle-orm';
import {
  boolean,
  customType,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

export const collaborative_documents = pgTable('collaborative_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  content: text('content'),
  // Board-level markdown description (board-overview briefing). Boards only.
  description: text('description'),
  created_by: uuid('created_by'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  last_edited_by: uuid('last_edited_by'),
  is_public: boolean('is_public').default(false),
  permissions: jsonb('permissions').$type<Record<string, unknown>>().default({}),
  folder_id: uuid('folder_id'),
  is_deleted: boolean('is_deleted').default(false),
  document_subtype: text('document_subtype').default('docs'),
  share_permission: text('share_permission').default('editor'),
  share_mode: text('share_mode').default('private'),
  last_edited_at: timestamp('last_edited_at', { withTimezone: true }).defaultNow(),
  wolke_share_link_id: text('wolke_share_link_id'),
  wolke_file_path: text('wolke_file_path'),
  wolke_etag: text('wolke_etag'),
  wolke_live_sync: boolean('wolke_live_sync').default(false),
  last_synced_at: timestamp('last_synced_at', { withTimezone: true }),
});

export const collaborative_documents_init = pgTable(
  'collaborative_documents_init',
  {
    document_id: uuid('document_id').notNull(),
    init_data: bytea('init_data'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.document_id] })]
);

export const collaborative_document_folders = pgTable('collaborative_document_folders', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  parent_id: uuid('parent_id'),
  created_by: uuid('created_by'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  is_deleted: boolean('is_deleted').default(false),
});

export type CollaborativeDocument = InferSelectModel<typeof collaborative_documents>;
export type CollaborativeDocumentInit = InferSelectModel<typeof collaborative_documents_init>;
export type CollaborativeDocumentFolder = InferSelectModel<typeof collaborative_document_folders>;

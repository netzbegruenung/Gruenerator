import { type InferSelectModel } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const userSharepics = pgTable(
  'user_sharepics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id'),
    image_url: text('image_url'),
    title: text('title'),
    description: text('description'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [
    index('idx_user_sharepics_user_id').on(t.user_id),
    index('idx_user_sharepics_created_at').on(t.created_at),
  ]
);

export type UserSharepic = InferSelectModel<typeof userSharepics>;

export const userUploads = pgTable('user_uploads', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id'),
  file_name: text('file_name').notNull(),
  file_url: text('file_url'),
  file_path: text('file_path'),
  file_size: bigint('file_size', { mode: 'number' }),
  mime_type: text('mime_type'),
  upload_status: text('upload_status').notNull().default('pending'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
});

export type UserUpload = InferSelectModel<typeof userUploads>;

/**
 * Entry stored in the transfer_files JSONB array
 */
export interface TransferFileEntry {
  name: string;
  size: number;
  mimeType: string;
  wolkePath: string;
}

/**
 * Shape stored in `shared_media.image_metadata`. Open-ended (callers spread
 * arbitrary generator metadata) but documents the fields the responsive-image
 * pipeline relies on. See `sharedMediaService.processMediaVariants`.
 */
export interface SharedMediaImageMetadata extends Record<string, unknown> {
  width?: number;
  height?: number;
  blurhash?: string;
  variants?: number[];
  hasOriginalImage?: boolean;
  originalImageFilename?: string | null;
}

export const sharedMedia = pgTable(
  'shared_media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id'),
    share_token: varchar('share_token', { length: 32 }).notNull().unique(),
    media_type: varchar('media_type', { length: 10 }).notNull(),
    title: text('title'),
    file_path: text('file_path'),
    file_name: text('file_name'),
    thumbnail_path: text('thumbnail_path'),
    file_size: bigint('file_size', { mode: 'number' }),
    mime_type: text('mime_type'),
    duration: numeric('duration'),
    project_id: uuid('project_id'),
    image_type: text('image_type'),
    image_metadata: jsonb('image_metadata').$type<SharedMediaImageMetadata>().notNull().default({}),
    status: varchar('status', { length: 20 }).notNull().default('ready'),
    download_count: integer('download_count').notNull().default(0),
    view_count: integer('view_count').notNull().default(0),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // Columns added via ALTER TABLE migrations
    is_library_item: boolean('is_library_item').notNull().default(true),
    alt_text: text('alt_text'),
    upload_source: text('upload_source').notNull().default('upload'),
    original_filename: text('original_filename'),
    is_template: boolean('is_template').notNull().default(false),
    template_visibility: text('template_visibility').notNull().default('private'),
    template_use_count: integer('template_use_count').notNull().default(0),
    template_creator_name: text('template_creator_name'),
    original_template_id: uuid('original_template_id'),
    wolke_share_link_id: text('wolke_share_link_id'),
    wolke_file_path: text('wolke_file_path'),
    expires_at: timestamp('expires_at', { withTimezone: true }),
    password_hash: text('password_hash'),
    transfer_files: jsonb('transfer_files').$type<TransferFileEntry[]>().notNull().default([]),
    transfer_message: text('transfer_message'),
  },
  (t) => [
    index('idx_shared_media_token').on(t.share_token),
    index('idx_shared_media_user').on(t.user_id),
    index('idx_shared_media_user_type').on(t.user_id, t.media_type),
    index('idx_shared_media_user_created').on(t.user_id, t.created_at),
    index('idx_shared_media_library').on(t.user_id, t.is_library_item, t.created_at),
    index('idx_shared_media_templates').on(t.is_template, t.template_visibility, t.created_at),
    index('idx_shared_media_public_templates').on(
      t.is_template,
      t.template_visibility,
      t.image_type,
      t.created_at
    ),
  ]
);

export type SharedMedia = InferSelectModel<typeof sharedMedia>;

export const sharedMediaDownloads = pgTable(
  'shared_media_downloads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shared_media_id: uuid('shared_media_id'),
    downloader_email: text('downloader_email'),
    downloaded_at: timestamp('downloaded_at', { withTimezone: true }).notNull().defaultNow(),
    ip_address: text('ip_address'),
  },
  (t) => [index('idx_shared_media_downloads_media').on(t.shared_media_id)]
);

export type SharedMediaDownload = InferSelectModel<typeof sharedMediaDownloads>;

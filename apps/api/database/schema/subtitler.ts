import {
  bigint,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const subtitlerProjects = pgTable('subtitler_projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id'),
  title: text('title').notNull(),
  status: text('status').notNull().default('saved'),
  video_path: text('video_path').notNull(),
  video_filename: text('video_filename').notNull(),
  video_size: bigint('video_size', { mode: 'number' }).notNull(),
  video_metadata: jsonb('video_metadata').$type<Record<string, unknown>>().notNull().default({}),
  thumbnail_path: text('thumbnail_path'),
  subtitled_video_path: text('subtitled_video_path'),
  subtitles: text('subtitles'),
  style_preference: text('style_preference').notNull().default('standard'),
  height_preference: text('height_preference').notNull().default('standard'),
  mode_preference: text('mode_preference').notNull().default('manual'),
  style_settings: jsonb('style_settings').$type<Record<string, unknown>>().notNull().default({}),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  last_edited_at: timestamp('last_edited_at', { withTimezone: true }).notNull().defaultNow(),
  export_count: integer('export_count').notNull().default(0),
});

export const subtitlerSharedVideos = pgTable('subtitler_shared_videos', {
  id: uuid('id').primaryKey().defaultRandom(),
  project_id: uuid('project_id'),
  user_id: uuid('user_id'),
  share_token: varchar('share_token', { length: 32 }).notNull().unique(),
  video_path: text('video_path'),
  video_filename: text('video_filename'),
  title: text('title'),
  thumbnail_path: text('thumbnail_path'),
  duration: numeric('duration'),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  download_count: integer('download_count').notNull().default(0),
  status: varchar('status', { length: 20 }).notNull().default('ready'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const subtitlerShareDownloads = pgTable('subtitler_share_downloads', {
  id: uuid('id').primaryKey().defaultRandom(),
  shared_video_id: uuid('shared_video_id'),
  email: text('email').notNull(),
  downloaded_at: timestamp('downloaded_at', { withTimezone: true }).notNull().defaultNow(),
  ip_address: text('ip_address'),
});

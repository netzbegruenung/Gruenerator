/**
 * Drizzle schema for the content-sync article event log.
 *
 * Runtime DDL lives in the raw migration
 * (database/postgres/migrations/create_content_sync_articles.sql); this file
 * is the *type* source. Column shapes reuse the Zod-inferred types from
 * `@gruenerator/contracts` so the contract stays the single source of truth.
 */
import {
  type ContentSyncRunStatus,
  type ContentSyncSource,
  type SyncArticleEventType,
  type SyncArticleSourceGroup,
} from '@gruenerator/contracts';
import { type InferSelectModel } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

/** One row per article per day, upserted on (source_url, event_date). */
export const contentSyncArticles = pgTable(
  'content_sync_articles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    source_url: text('source_url').notNull(),
    source_group_id: text('source_group_id').$type<SyncArticleSourceGroup>().notNull(),
    source_name: text('source_name').notNull(),
    excerpt: text('excerpt'),
    landesverband: text('landesverband'),
    collection: text('collection').notNull(),
    event_type: text('event_type').$type<SyncArticleEventType>().notNull(),
    published_at: timestamp('published_at', { withTimezone: true, mode: 'string' }),
    indexed_at: timestamp('indexed_at', { withTimezone: true, mode: 'string' }).notNull(),
    // Computed server-side at insert (UTC); plain DATE carries the unique index.
    event_date: date('event_date').notNull(),
    sync_run_id: text('sync_run_id'),
    sync_run_url: text('sync_run_url'),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('content_sync_articles_url_day').on(t.source_url, t.event_date),
    index('idx_csa_event_date').on(t.event_date),
    index('idx_csa_source_group').on(t.source_group_id),
    index('idx_csa_landesverband').on(t.landesverband),
  ]
);
export type ContentSyncArticleRow = InferSelectModel<typeof contentSyncArticles>;

/**
 * URLs a scraper fetched and then rejected, so the next walk can skip them
 * before paying for the fetch (#3200).
 *
 * Runtime DDL: migrations/zz_20260915_scraper_rejected_urls.sql, which carries
 * the reasoning — in short, only *monotone* rejections belong here ('too_old'),
 * and `published_at` is stored rather than a bare flag so the gate re-decides
 * against the source's current maxAgeYears instead of blocking forever.
 */
export const scraperRejectedUrls = pgTable(
  'scraper_rejected_urls',
  {
    source_url: text('source_url').primaryKey(),
    source_id: text('source_id').notNull(),
    reason: text('reason').notNull(),
    published_at: timestamp('published_at', { withTimezone: true, mode: 'string' }).notNull(),
    rejected_at: timestamp('rejected_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('idx_scraper_rejected_source').on(t.source_id)]
);
export type ScraperRejectedUrlRow = InferSelectModel<typeof scraperRejectedUrls>;

/**
 * Run history for the admin panel's content-sync tab: one row per source or
 * Landesverband run. Runtime DDL: migrations/zz_20261124b_content_sync_runs.sql.
 */
export const contentSyncRuns = pgTable(
  'content_sync_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    source_id: text('source_id').$type<ContentSyncSource>().notNull(),
    landesverband: text('landesverband'),
    name: text('name').notNull(),
    status: text('status').$type<ContentSyncRunStatus>().notNull(),
    recent: boolean('recent').notNull().default(false),
    dry_run: boolean('dry_run').notNull().default(false),
    stored: integer('stored').notNull().default(0),
    updated: integer('updated').notNull().default(0),
    skipped: integer('skipped').notNull().default(0),
    errors: integer('errors').notNull().default(0),
    dead_links: integer('dead_links').notNull().default(0),
    failure_message: text('failure_message'),
    error_samples: jsonb('error_samples').$type<string[]>().notNull().default([]),
    dead_link_samples: jsonb('dead_link_samples').$type<string[]>().notNull().default([]),
    run_url: text('run_url'),
    started_at: timestamp('started_at', { withTimezone: true, mode: 'string' }).notNull(),
    duration_ms: integer('duration_ms').notNull(),
  },
  (t) => [index('idx_content_sync_runs_started_at').on(t.started_at)]
);
export type ContentSyncRunRow = InferSelectModel<typeof contentSyncRuns>;

/** Single row (id = 1): the admin-panel switch for content-sync report mails. */
export const contentSyncSettings = pgTable('content_sync_settings', {
  id: smallint('id').primaryKey().default(1),
  email_enabled: boolean('email_enabled').notNull().default(false),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .defaultNow(),
  updated_by: uuid('updated_by'),
});

/**
 * Drizzle schema for the content-sync article event log.
 *
 * Runtime DDL lives in the raw migration
 * (database/postgres/migrations/create_content_sync_articles.sql); this file
 * is the *type* source. Column shapes reuse the Zod-inferred types from
 * `@gruenerator/contracts` so the contract stays the single source of truth.
 */
import { type SyncArticleEventType, type SyncArticleSourceGroup } from '@gruenerator/contracts';
import { type InferSelectModel } from 'drizzle-orm';
import { date, index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

/** One row per article per day, upserted on (source_url, event_date). */
export const contentSyncArticles = pgTable(
  'content_sync_articles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    source_url: text('source_url').notNull(),
    source_group_id: text('source_group_id').$type<SyncArticleSourceGroup>().notNull(),
    source_name: text('source_name').notNull(),
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

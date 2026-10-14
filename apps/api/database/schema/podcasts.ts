import { type PodcastScript } from '@gruenerator/contracts';
import { type InferSelectModel, sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// See migrations/zz_20261010_podcasts.sql and zz_20261010b_podcasts_slug_trash.sql.
export const podcasts = pgTable(
  'podcasts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id').notNull(),
    slug_suffix: varchar('slug_suffix', { length: 12 }).notNull(),
    title: text('title').notNull(),
    source_text: text('source_text').notNull(),
    script: jsonb('script').$type<PodcastScript>(),
    /** podcastStatusSchema — CHECK in the migration. */
    status: text('status').notNull().default('queued'),
    error: text('error'),
    voice_a: varchar('voice_a', { length: 16 }).notNull(),
    voice_b: varchar('voice_b', { length: 16 }).notNull(),
    /** 'de-DE' | 'de-AT' — CHECK in the migration. */
    locale: varchar('locale', { length: 5 }).notNull().default('de-DE'),
    media_id: uuid('media_id'),
    duration_seconds: real('duration_seconds'),
    claim_at: timestamp('claim_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_podcasts_user_created').on(t.user_id, t.created_at.desc()),
    uniqueIndex('uq_podcasts_slug_suffix')
      .on(t.slug_suffix)
      .where(sql`deleted_at IS NULL`),
    index('idx_podcasts_pending')
      .on(t.created_at)
      .where(sql`status IN ('queued', 'scripting', 'voicing')`),
  ]
);

export type PodcastRow = InferSelectModel<typeof podcasts>;

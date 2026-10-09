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
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// See migrations/zz_20261010_podcasts.sql.
export const podcasts = pgTable(
  'podcasts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id').notNull(),
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
  },
  (t) => [
    index('idx_podcasts_user_created').on(t.user_id, t.created_at.desc()),
    index('idx_podcasts_pending')
      .on(t.created_at)
      .where(sql`status IN ('queued', 'scripting', 'voicing')`),
  ]
);

export type PodcastRow = InferSelectModel<typeof podcasts>;

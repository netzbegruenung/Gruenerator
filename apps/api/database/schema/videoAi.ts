import { type VideoAiBrief } from '@gruenerator/contracts';
import { type InferSelectModel, sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  type StoredVideoAiAnalysis,
  type StoredVideoAiInput,
  type StoredVideoAiVersion,
} from '../../services/videoAi/projectTypes.js';

// See migrations/zz_20261111c_video_ai_projects.sql.
export const videoAiProjects = pgTable(
  'video_ai_projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id').notNull(),
    slug_suffix: varchar('slug_suffix', { length: 12 }).notNull(),
    title: text('title').notNull(),
    /** 'de-DE' | 'de-AT' — CHECK in the migration. */
    locale: varchar('locale', { length: 5 }).notNull().default('de-DE'),
    brief: jsonb('brief').$type<VideoAiBrief>().notNull(),
    inputs: jsonb('inputs').$type<StoredVideoAiInput[]>().notNull(),
    /** videoAiStatusSchema — CHECK in the migration. */
    status: text('status').notNull().default('queued'),
    error: text('error'),
    warnings: jsonb('warnings').$type<string[]>().notNull().default([]),
    analysis: jsonb('analysis').$type<StoredVideoAiAnalysis>(),
    versions: jsonb('versions').$type<StoredVideoAiVersion[]>().notNull().default([]),
    current_version: integer('current_version'),
    tree_units: integer('tree_units').notNull().default(0),
    tree_day: varchar('tree_day', { length: 10 }),
    handed_off_at: timestamp('handed_off_at', { withTimezone: true }),
    claim_at: timestamp('claim_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_video_ai_projects_user_created').on(t.user_id, t.created_at.desc()),
    uniqueIndex('uq_video_ai_projects_slug_suffix')
      .on(t.slug_suffix)
      .where(sql`deleted_at IS NULL`),
    index('idx_video_ai_projects_pending')
      .on(t.created_at)
      .where(sql`status IN ('queued', 'analyzing', 'cutting', 'designing')`),
  ]
);

export type VideoAiProjectRow = InferSelectModel<typeof videoAiProjects>;

import { type ExplainableContent } from '@gruenerator/contracts';
import { type InferSelectModel, sql } from 'drizzle-orm';
import {
  date,
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

// See migrations/zz_20261009_explainables.sql.
export const explainables = pgTable(
  'explainables',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id').notNull(),
    thread_id: uuid('thread_id'),
    source_message_id: uuid('source_message_id'),
    slug_suffix: varchar('slug_suffix', { length: 12 }).notNull(),
    title: text('title').notNull(),
    content: jsonb('content').$type<ExplainableContent>().notNull(),
    /** explainableStatusSchema — CHECK in the migration. */
    status: text('status').notNull().default('images_pending'),
    /** explainableShareModeSchema — CHECK in the migration. */
    share_mode: text('share_mode').notNull().default('private'),
    share_token: varchar('share_token', { length: 32 }),
    reserved_units: integer('reserved_units').notNull().default(0),
    reserved_day: date('reserved_day', { mode: 'string' }),
    claim_at: timestamp('claim_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_explainables_user_created')
      .on(t.user_id, t.created_at.desc())
      .where(sql`deleted_at IS NULL`),
    uniqueIndex('uq_explainables_slug_suffix')
      .on(t.slug_suffix)
      .where(sql`deleted_at IS NULL`),
    uniqueIndex('uq_explainables_share_token')
      .on(t.share_token)
      .where(sql`share_token IS NOT NULL`),
    index('idx_explainables_images_pending')
      .on(t.created_at)
      .where(sql`status = 'images_pending'`),
  ]
);

export type ExplainableRow = InferSelectModel<typeof explainables>;

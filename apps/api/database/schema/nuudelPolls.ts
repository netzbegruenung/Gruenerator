import { type InferSelectModel } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * nuudel-Umfragen, die der Grünerator für eine Person angelegt hat.
 * DDL: `migrations/zz_20261119_nuudel_polls.sql`.
 */
export const nuudelPolls = pgTable(
  'nuudel_polls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id').notNull(),
    kind: text('kind', { enum: ['date', 'classic'] }).notNull(),
    title: text('title').notNull(),
    /** Öffentliche ID (16 Zeichen): `<base>/<poll_id>` ist der Teilnahme-Link. */
    poll_id: text('poll_id').notNull().unique(),
    /** Admin-ID (24 Zeichen): `<base>/<admin_id>/admin`. Die Zugangsberechtigung. */
    admin_id: text('admin_id').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_nuudel_polls_user').on(t.user_id, t.created_at)]
);
export type NuudelPollRow = InferSelectModel<typeof nuudelPolls>;

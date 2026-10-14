import { type BelegMeta, type ReisekostenServerState } from '@gruenerator/contracts';
import { type InferSelectModel, sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

// Saved Reisekostenabrechnungen. See
// migrations/zz_20261008_reisekosten_abrechnungen.sql: `state` never carries
// address, phone or bank details, `belege` only metadata — never the files.
export const reisekostenAbrechnungen = pgTable(
  'reisekosten_abrechnungen',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id').notNull(),
    /** Stable 6-char slug key; the name part of the slug follows `titel`. */
    slug_suffix: text('slug_suffix').notNull(),
    titel: text('titel').notNull().default(''),
    /** 'entwurf' | 'eingereicht' — CHECK in the migration, z.enum at the HTTP edge. */
    status: text('status').notNull().default('entwurf'),
    state: jsonb('state').$type<ReisekostenServerState>().notNull(),
    belege: jsonb('belege')
      .$type<BelegMeta[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_reisekosten_abrechnungen_user_updated')
      .on(t.user_id, t.updated_at.desc())
      .where(sql`deleted_at IS NULL`),
    uniqueIndex('uq_reisekosten_abrechnungen_slug_suffix')
      .on(t.slug_suffix)
      .where(sql`deleted_at IS NULL`),
  ]
);

export type ReisekostenAbrechnungRow = InferSelectModel<typeof reisekostenAbrechnungen>;

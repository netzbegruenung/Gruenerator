import { type InferSelectModel } from 'drizzle-orm';
import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

// Letterheads (Absender) a user can pick from when exporting a PDF. See
// migrations/create_user_letterheads.sql for the rationale: someone writing for
// both a Kreisverband and a Fraktion needs two, and the choice belongs at the
// export rather than in a global setting they have to switch first.
export const userLetterheads = pgTable(
  'user_letterheads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id').notNull(),
    /** Shown in the picker, unique per user. */
    label: text('label').notNull(),
    organization: text('organization'),
    /** Multi-line free text — senderLines() splits it on '\n'. */
    address: text('address'),
    /**
     * 'fensterkuvert' | 'direktfrankierung' — steuert, ob oben rechts die
     * Freimachungszone freibleibt. Kein pgEnum: der Check-Constraint steht in
     * der Migration, die geschlossene Menge erzwingt das Zod-Schema am
     * HTTP-Rand.
     */
    dispatch_mode: text('dispatch_mode').notNull().default('fensterkuvert'),
    show_return_line: boolean('show_return_line').notNull().default(true),
    show_fold_marks: boolean('show_fold_marks').notNull().default(true),
    /** Dateiname des eigenen Briefbogens unter uploads/letterheads/<user_id>/. */
    stationery_file: text('stationery_file'),
    is_default: boolean('is_default').notNull().default(false),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('user_letterheads_user_label_unique').on(t.user_id, t.label),
    index('idx_user_letterheads_user_id').on(t.user_id),
  ]
);

export type UserLetterheadRow = InferSelectModel<typeof userLetterheads>;

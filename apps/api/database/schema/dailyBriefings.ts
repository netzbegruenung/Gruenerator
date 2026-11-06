import { type InferSelectModel } from 'drizzle-orm';
import {
  bigserial,
  date,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Tagesbriefing-Ledger: eine Zeile je Person und Kalendertag (Europe/Berlin).
 * Der Primärschlüssel ist der Claim gegen doppelte Briefings.
 * DDL: `migrations/zz_20261106_daily_briefing.sql`.
 */
export const dailyBriefings = pgTable(
  'daily_briefings',
  {
    user_id: uuid('user_id').notNull(),
    day: date('day', { mode: 'string' }).notNull(),
    thread_id: uuid('thread_id'),
    status: text('status').$type<'pending' | 'created' | 'skipped' | 'failed'>().notNull(),
    opened_at: timestamp('opened_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.user_id, t.day] })]
);
export type DailyBriefingRow = InferSelectModel<typeof dailyBriefings>;

/**
 * Das geteilte Lagebild je Monitor-Locale, stündlich im Monitor-Refresh
 * erzeugt. `payload` wird beim Lesen per Zod geprüft (`services/briefing/lagebild.ts`).
 */
export const monitorLagebilder = pgTable(
  'monitor_lagebilder',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    locale: text('locale').$type<'de' | 'at'>().notNull(),
    generated_at: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
    payload: jsonb('payload').notNull(),
  },
  (t) => [index('idx_monitor_lagebilder_locale_generated').on(t.locale, t.generated_at)]
);
export type MonitorLagebildRow = InferSelectModel<typeof monitorLagebilder>;

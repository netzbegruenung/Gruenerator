import { type InferSelectModel } from 'drizzle-orm';
import { date, integer, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';

/**
 * Anonymous per-day tally of created content — no user id. Written only by the
 * triggers in migrations/zz_20261026_platform_creation_daily.sql (and, for
 * notebooks, by NotebookQdrantHelper via count_platform_creation()).
 */
export const platformCreationDaily = pgTable(
  'platform_creation_daily',
  {
    day: date('day').notNull(),
    kind: text('kind').notNull(),
    subtype: text('subtype').notNull().default(''),
    /** 'de' | 'at' | 'unknown' */
    locale: text('locale').notNull().default('unknown'),
    count: integer('count').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.day, table.kind, table.subtype, table.locale] })]
);

export type PlatformCreationDailyRow = InferSelectModel<typeof platformCreationDaily>;

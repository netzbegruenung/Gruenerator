import { type InferSelectModel } from 'drizzle-orm';
import {
  bigint,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Per-user consumption aggregate, one row per day / feature / model / unit.
 * LLM calls carry token counts, everything else counts `ops` (images,
 * transcriptions, web searches). Written only by UsageTrackingService.
 */
export const userUsageDaily = pgTable(
  'user_usage_daily',
  {
    userId: uuid('user_id').notNull(),
    day: date('day').notNull(),
    feature: text('feature').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    unit: text('unit').notNull().default('tokens'),
    requests: integer('requests').notNull().default(0),
    inputTokens: bigint('input_tokens', { mode: 'number' }).notNull().default(0),
    outputTokens: bigint('output_tokens', { mode: 'number' }).notNull().default(0),
    ops: integer('ops').notNull().default(0),
    /**
     * MEASURED footprint, in GreenPT's own units (watt-milliseconds, micrograms
     * CO2e). Only GreenPT reports these; every other provider leaves them at 0
     * and the read path estimates from tokens instead. Storing the raw units
     * keeps the value integral and lets a coefficient correction re-derive
     * history without a backfill — see services/usage/energyFootprint.ts.
     */
    energyWms: bigint('energy_wms', { mode: 'number' }).notNull().default(0),
    emissionsUg: bigint('emissions_ug', { mode: 'number' }).notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({
      name: 'user_usage_daily_pk',
      columns: [t.userId, t.day, t.feature, t.provider, t.model, t.unit],
    }),
    index('idx_user_usage_daily_user_day').on(t.userId, t.day),
  ]
);

export type UserUsageDailyRow = InferSelectModel<typeof userUsageDaily>;

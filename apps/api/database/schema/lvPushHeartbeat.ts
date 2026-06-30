/**
 * Drizzle schema for the Landesverband push heartbeat.
 *
 * One row per LV source id. The push-ingest endpoint upserts `last_push_at` on
 * every successful ingest/delete; the scheduled scraper reads it and skips a
 * source that has pushed recently (the "plugin is default, code decides"
 * switchover — see services/landesverbandIngestion/pushHeartbeat.ts).
 *
 * Runtime DDL lives in the raw migration
 * (database/postgres/migrations/create_lv_push_heartbeat.sql); this file is the
 * *type* source.
 */
import { type InferSelectModel } from 'drizzle-orm';
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** One row per Landesverband `source.id` that has ever pushed. */
export const lvPushHeartbeat = pgTable('lv_push_heartbeat', {
  source_id: text('source_id').primaryKey(),
  last_push_at: timestamp('last_push_at', { withTimezone: true, mode: 'string' }).notNull(),
});

export type LvPushHeartbeatRow = InferSelectModel<typeof lvPushHeartbeat>;

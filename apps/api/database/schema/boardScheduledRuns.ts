import { type BoardFlowConfig } from '@gruenerator/contracts';
import { type InferSelectModel } from 'drizzle-orm';
import { boolean, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Type source for the scheduled / recurring KI-Spalte runs table. Runtime DDL lives
 * in database/postgres/migrations/create_board_scheduled_runs.sql (auto-run on
 * startup); this schema exists so the service layer derives its row type via
 * InferSelectModel instead of a hand-written interface.
 *
 * A schedule is an upstream trigger on the existing agent pipeline: the poller
 * enqueues an agent_tasks row from `flow_config` and advances `next_run_at` from
 * the RRULE. See boardScheduleWorker.ts.
 */
export const board_scheduled_runs = pgTable('board_scheduled_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  board_id: uuid('board_id').notNull(),
  card_id: text('card_id').notNull(),
  created_by: uuid('created_by').notNull(),
  locale: text('locale').notNull().default('de-DE'),
  // Resolved flow config (same shape stored on agent_tasks.flow_config).
  flow_config: jsonb('flow_config').$type<BoardFlowConfig>().notNull(),
  // iCalendar RRULE string, interpreted in `timezone`.
  rrule: text('rrule').notNull(),
  timezone: text('timezone').notNull().default('Europe/Berlin'),
  require_review: boolean('require_review').notNull().default(false),
  enabled: boolean('enabled').notNull().default(true),
  next_run_at: timestamp('next_run_at', { withTimezone: true }).notNull(),
  last_run_at: timestamp('last_run_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type BoardScheduledRun = InferSelectModel<typeof board_scheduled_runs>;

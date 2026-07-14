import { type InferSelectModel } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * EXPERIMENTAL — standalone recurring agent tasks ("Wiederkehrende Aufgabe").
 *
 * Type source for the recurring_tasks queue. Runtime DDL lives in
 * database/postgres/migrations/create_recurring_tasks.sql (auto-run on startup);
 * this schema exists so the service layer derives its row type via
 * InferSelectModel instead of a hand-written interface.
 *
 * Unlike board_scheduled_runs this is NOT board/card-scoped: a task references an
 * agent by identifier (TEXT slug, resolved own→group→system via getAgentForUser)
 * and delivers its result to the user directly (document / summary / chat thread).
 * The recurrenceTaskWorker poller claims due rows (FOR UPDATE SKIP LOCKED →
 * cluster-safe), runs the agent, delivers, and advances next_run_at from the RRULE.
 */

// Where a run's result is delivered. Closed set — mirror in the Zod enum.
export type RecurringTaskDelivery = 'document' | 'summary' | 'thread';

export const recurring_tasks = pgTable(
  'recurring_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id').notNull(),
    // Agent to run (own / group-shared / system). TEXT slug, never a UUID.
    // Null → the default universal agent.
    agent_identifier: text('agent_identifier'),
    title: text('title').notNull(),
    instruction: text('instruction').notNull(),
    delivery: text('delivery').$type<RecurringTaskDelivery>().notNull().default('document'),
    // iCalendar RRULE, e.g. "FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0".
    rrule: text('rrule').notNull(),
    // IANA timezone the RRULE is interpreted in.
    timezone: text('timezone').notNull().default('Europe/Berlin'),
    enabled: boolean('enabled').notNull().default(true),
    locale: text('locale').notNull().default('de-DE'),
    // Reserved for absorbed briefing features (sources[], timeRange, outputFormat).
    // Null in v1.
    config: jsonb('config').$type<Record<string, unknown> | null>(),
    // Empty-suppression (absorbed from briefing): a run that finds nothing new
    // skips delivery and increments this; a run with output resets it to 0.
    consecutive_empty_count: integer('consecutive_empty_count').notNull().default(0),
    next_run_at: timestamp('next_run_at', { withTimezone: true }).notNull(),
    last_run_at: timestamp('last_run_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_recurring_tasks_due').on(t.enabled, t.next_run_at),
    index('idx_recurring_tasks_user').on(t.user_id),
  ]
);

export type RecurringTask = InferSelectModel<typeof recurring_tasks>;

// Per-execution history (absorbed from briefing_executions). Surfaced in the UI.
export type RecurringTaskRunStatus = 'completed' | 'empty' | 'failed';

export const recurring_task_runs = pgTable(
  'recurring_task_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    task_id: uuid('task_id').notNull(),
    status: text('status').$type<RecurringTaskRunStatus>().notNull(),
    results_summary: text('results_summary'),
    // Set on document/thread delivery so the UI can deep-link the artifact.
    result_url: text('result_url'),
    error: text('error'),
    duration_ms: integer('duration_ms'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_recurring_task_runs_task').on(t.task_id, t.created_at)]
);

export type RecurringTaskRun = InferSelectModel<typeof recurring_task_runs>;

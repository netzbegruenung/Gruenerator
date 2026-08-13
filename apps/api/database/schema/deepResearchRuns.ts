import { type InferSelectModel } from 'drizzle-orm';
import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Type source for the deep research run registry. Runtime DDL lives in
 * database/postgres/migrations/create_deep_research_runs.sql (auto-run on
 * startup); this schema exists so the service layer derives its row type via
 * InferSelectModel instead of a hand-written interface.
 *
 * The checkpointer stores a run's STATE under a thread_id; this table is what
 * makes that state findable — whose run, about what, and whether it ever
 * finished. See services/research/deepAgent/runRegistry.ts.
 */
export const deep_research_runs = pgTable(
  'deep_research_runs',
  {
    thread_id: text('thread_id').primaryKey(),
    user_id: text('user_id'),
    question: text('question').notNull(),
    locale: text('locale').notNull().default('de-DE'),
    status: text('status').$type<DeepResearchRunStatus>().notNull().default('running'),
    document_id: uuid('document_id'),
    partial: boolean('partial').notNull().default(false),
    started_at: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finished_at: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_deep_research_runs_status_started').on(table.status, table.started_at),
    index('idx_deep_research_runs_started').on(table.started_at),
  ]
);

/** `running` past a restart is what makes a run resumable. */
export type DeepResearchRunStatus = 'running' | 'finished' | 'failed';

export type DeepResearchRun = InferSelectModel<typeof deep_research_runs>;

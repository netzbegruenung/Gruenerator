import { type BoardFlowConfig } from '@gruenerator/contracts';
import { type InferSelectModel } from 'drizzle-orm';
import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Type source for the asynchronous board-agent task queue. Runtime DDL lives in
 * database/postgres/migrations/create_async_agent.sql (auto-run on startup); this
 * schema exists so the service layer derives its row type via InferSelectModel
 * instead of a hand-written interface.
 */

export type AgentTaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export const agent_tasks = pgTable('agent_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  board_id: uuid('board_id').notNull(),
  card_id: text('card_id').notNull(),
  trigger_comment_id: uuid('trigger_comment_id'),
  requested_by: uuid('requested_by').notNull(),
  task_text: text('task_text').notNull(),
  status: text('status').$type<AgentTaskStatus>().notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  max_attempts: integer('max_attempts').notNull().default(3),
  result_document_id: uuid('result_document_id'),
  error: text('error'),
  locale: text('locale').notNull().default('de-DE'),
  // AI-column flow config (source + AI step + output nodes + card context). Null for
  // legacy @-mention tasks. See database/postgres/migrations/add_agent_task_flow_config.sql.
  flow_config: jsonb('flow_config').$type<BoardFlowConfig | null>(),
  // Identifier of the agent to run this task (own / group-shared / system), picked in
  // a comment @-mention or a card assignment. A TEXT slug, never a UUID. Null = the
  // default universal agent. See migrations/add_agent_task_agent_id.sql.
  agent_id: text('agent_id'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  started_at: timestamp('started_at', { withTimezone: true }),
  completed_at: timestamp('completed_at', { withTimezone: true }),
});

export type AgentTask = InferSelectModel<typeof agent_tasks>;

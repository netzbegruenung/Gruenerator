import { type InferSelectModel } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

export const userAgents = pgTable(
  'user_agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id').notNull(),
    identifier: text('identifier').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    system_role: text('system_role').notNull(),
    avatar: text('avatar').notNull(),
    // react-icons Phosphor component name (e.g. `PiSparkle`). User agents render
    // this icon; `avatar` (emoji) is a legacy fallback for rows without one.
    icon_key: text('icon_key'),
    background_color: text('background_color').notNull(),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    model: text('model').notNull(),
    default_model: text('default_model'),
    provider: text('provider').notNull(),
    params: jsonb('params').$type<{ max_tokens: number; temperature: number }>().notNull(),
    opening_message: text('opening_message').notNull(),
    opening_questions: jsonb('opening_questions').$type<string[]>().notNull().default([]),
    locale: text('locale').notNull().default('de-DE'),
    author: text('author').notNull(),
    default_notebook_id: text('default_notebook_id'),
    plugins: jsonb('plugins').$type<string[]>(),
    enabled_tools: jsonb('enabled_tools').$type<string[]>(),
    skill_mentions: jsonb('skill_mentions').$type<string[]>(),
    few_shot_examples:
      jsonb('few_shot_examples').$type<
        Array<{ input: string; output: string; reasoning?: string }>
      >(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('user_agents_user_identifier_unique').on(t.user_id, t.identifier),
    index('idx_user_agents_user_id').on(t.user_id),
  ]
);

export type UserAgentRow = InferSelectModel<typeof userAgents>;

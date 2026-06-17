import { type InferSelectModel } from 'drizzle-orm';
import { boolean, index, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

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
    // Sharing (see migrations/user_agents_sharing_columns.sql). share_mode gates
    // who can see/use the agent; is_public lists it in the public Agentura
    // directory atop share_mode='authenticated'; public_ownership is the legal
    // attestation required when is_public=true. Agents are used, not co-edited —
    // there is no edit_policy. `locale` doubles as the audience filter.
    share_mode: text('share_mode').notNull().default('private'),
    is_public: boolean('is_public').notNull().default(false),
    public_ownership: text('public_ownership'),
    plugins: jsonb('plugins').$type<string[]>(),
    enabled_tools: jsonb('enabled_tools').$type<string[]>(),
    skill_mentions: jsonb('skill_mentions').$type<string[]>(),
    // When true, source URLs of search hits are injected into the model context
    // so the agent writes concrete article links inline (e.g. ready-to-send mails).
    inline_source_links: boolean('inline_source_links'),
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
    index('idx_user_agents_public').on(t.is_public),
  ]
);

export type UserAgentRow = InferSelectModel<typeof userAgents>;

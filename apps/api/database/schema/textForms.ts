import { type InferSelectModel } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

// Per-user learned writing styles ("angelernte Textformen"). See
// migrations/create_user_text_forms.sql for the full rationale. `mention` is the
// runtime lookup key the ChatGraph respond node resolves the active skill/mention
// against; `style_block` is the edited text injected into the system prompt.
export const userTextForms = pgTable(
  'user_text_forms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id').notNull(),
    kind: text('kind').notNull().default('custom'), // 'preset' | 'custom'
    text_type: text('text_type'), // 'instagram'|'facebook'|'presse'|'antrag' (presets only)
    mention: text('mention').notNull(),
    title: text('title').notNull(),
    examples: jsonb('examples').$type<Array<{ content: string }>>().notNull().default([]),
    style_block: text('style_block').notNull().default(''),
    model: text('model'),
    analyzed_at: timestamp('analyzed_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('user_text_forms_user_mention_unique').on(t.user_id, t.mention),
    index('idx_user_text_forms_user_id').on(t.user_id),
  ]
);

export type UserTextFormRow = InferSelectModel<typeof userTextForms>;

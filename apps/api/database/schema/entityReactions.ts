import { type InferSelectModel } from 'drizzle-orm';
import { index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

export const entityReactions = pgTable(
  'entity_reactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entity_type: text('entity_type').notNull(),
    entity_id: text('entity_id').notNull(),
    user_id: uuid('user_id').notNull(),
    emoji: text('emoji').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('entity_reactions_entity_type_entity_id_user_id_emoji_key').on(
      t.entity_type,
      t.entity_id,
      t.user_id,
      t.emoji
    ),
    index('idx_entity_reactions_entity').on(t.entity_type, t.entity_id),
  ]
);

export type EntityReactionRow = InferSelectModel<typeof entityReactions>;

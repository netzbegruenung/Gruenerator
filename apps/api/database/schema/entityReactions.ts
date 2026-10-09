import { type InferSelectModel, sql } from 'drizzle-orm';
import { check, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

// One nullable FK column per reactable entity (ON DELETE CASCADE in SQL), so
// Postgres removes reactions together with their target.
export const entityReactions = pgTable(
  'entity_reactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id').notNull(),
    emoji: text('emoji').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    group_share_id: uuid('group_share_id'),
    group_comment_id: uuid('group_comment_id'),
    board_comment_id: uuid('board_comment_id'),
  },
  (t) => [
    check(
      'entity_reactions_one_target',
      sql`num_nonnulls(${t.group_share_id}, ${t.group_comment_id}, ${t.board_comment_id}) = 1`
    ),
    uniqueIndex('uq_entity_reactions_group_share')
      .on(t.group_share_id, t.user_id, t.emoji)
      .where(sql`${t.group_share_id} IS NOT NULL`),
    uniqueIndex('uq_entity_reactions_group_comment')
      .on(t.group_comment_id, t.user_id, t.emoji)
      .where(sql`${t.group_comment_id} IS NOT NULL`),
    uniqueIndex('uq_entity_reactions_board_comment')
      .on(t.board_comment_id, t.user_id, t.emoji)
      .where(sql`${t.board_comment_id} IS NOT NULL`),
  ]
);

export type EntityReactionRow = InferSelectModel<typeof entityReactions>;

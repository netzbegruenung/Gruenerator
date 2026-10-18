import { type EntityCommentType } from '@gruenerator/contracts';
import { type InferSelectModel, sql } from 'drizzle-orm';
import { check, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

// One nullable FK column per reactable entity (ON DELETE CASCADE in SQL), so
// Postgres removes reactions together with their target. A marketplace item
// has no row to point at: `item_type` + `item_id` (its like key) count as one
// target, and each kind's purge deletes them. `agent_id`, `agent_comment_id`
// and `template_comment_id` are deprecated (2026-10-20), always NULL.
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
    agent_id: uuid('agent_id'),
    agent_comment_id: uuid('agent_comment_id'),
    template_comment_id: uuid('template_comment_id'),
    entity_comment_id: uuid('entity_comment_id'),
    item_type: text('item_type').$type<EntityCommentType>(),
    item_id: text('item_id'),
  },
  (t) => [
    check(
      'entity_reactions_one_target',
      sql`num_nonnulls(${t.group_share_id}, ${t.group_comment_id}, ${t.board_comment_id}, ${t.agent_id}, ${t.agent_comment_id}, ${t.template_comment_id}, ${t.entity_comment_id}, ${t.item_id}) = 1`
    ),
    check('entity_reactions_item_pair', sql`(${t.item_type} IS NULL) = (${t.item_id} IS NULL)`),
    check(
      'entity_reactions_item_type',
      sql`${t.item_type} IN ('agent', 'recipe', 'template', 'studio_asset')`
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
    uniqueIndex('uq_entity_reactions_agent')
      .on(t.agent_id, t.user_id, t.emoji)
      .where(sql`${t.agent_id} IS NOT NULL`),
    uniqueIndex('uq_entity_reactions_agent_comment')
      .on(t.agent_comment_id, t.user_id, t.emoji)
      .where(sql`${t.agent_comment_id} IS NOT NULL`),
    uniqueIndex('uq_entity_reactions_template_comment')
      .on(t.template_comment_id, t.user_id, t.emoji)
      .where(sql`${t.template_comment_id} IS NOT NULL`),
    uniqueIndex('uq_entity_reactions_entity_comment')
      .on(t.entity_comment_id, t.user_id, t.emoji)
      .where(sql`${t.entity_comment_id} IS NOT NULL`),
    uniqueIndex('uq_entity_reactions_item')
      .on(t.item_type, t.item_id, t.user_id, t.emoji)
      .where(sql`${t.item_id} IS NOT NULL`),
  ]
);

export type EntityReactionRow = InferSelectModel<typeof entityReactions>;

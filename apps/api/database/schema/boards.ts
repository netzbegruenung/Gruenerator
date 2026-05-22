import { type InferSelectModel } from 'drizzle-orm';
import { boolean, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Type source for the board comment tables. The runtime DDL lives in
 * `database/postgres/schema.sql` (auto-run on startup); these schemas exist so the
 * service layer derives row types via InferSelectModel instead of hand-written interfaces.
 */

interface CommentBlock {
  type: 'text' | 'mention' | 'link' | 'code';
  text?: string;
  userId?: string;
  displayName?: string;
  url?: string;
}

export const board_comments = pgTable('board_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  board_id: uuid('board_id').notNull(),
  card_id: text('card_id').notNull(),
  parent_id: uuid('parent_id'),
  user_id: uuid('user_id').notNull(),
  content: text('content'),
  blocks: jsonb('blocks').$type<CommentBlock[]>().notNull().default([]),
  mentioned_user_ids: uuid('mentioned_user_ids').array().default([]),
  is_edited: boolean('is_edited').notNull().default(false),
  edited_at: timestamp('edited_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const board_comment_reactions = pgTable('board_comment_reactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  comment_id: uuid('comment_id').notNull(),
  user_id: uuid('user_id').notNull(),
  emoji: text('emoji').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type BoardComment = InferSelectModel<typeof board_comments>;
export type BoardCommentReaction = InferSelectModel<typeof board_comment_reactions>;

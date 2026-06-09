import { type InferSelectModel } from 'drizzle-orm';
import { bigint, boolean, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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

// ── Per-card activity log (Feature: activity timeline) ────────────────────────

export const board_card_activity = pgTable('board_card_activity', {
  id: uuid('id').primaryKey().defaultRandom(),
  board_id: uuid('board_id').notNull(),
  // null for board-level events (A8); a card id for per-card events.
  card_id: text('card_id'),
  user_id: uuid('user_id').notNull(),
  type: text('type').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type BoardCardActivity = InferSelectModel<typeof board_card_activity>;

// ── Board-level watchers (A9) — whole-board subscriptions ─────────────────────

export const board_subscriptions = pgTable('board_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  board_id: uuid('board_id').notNull(),
  user_id: uuid('user_id').notNull(),
  source: text('source').notNull().default('manual'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type BoardSubscription = InferSelectModel<typeof board_subscriptions>;

// ── Card watchers / subscriptions (Feature: watchers + notifications) ─────────

export const board_card_subscriptions = pgTable('board_card_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  board_id: uuid('board_id').notNull(),
  card_id: text('card_id').notNull(),
  user_id: uuid('user_id').notNull(),
  source: text('source').notNull().default('manual'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type BoardCardSubscription = InferSelectModel<typeof board_card_subscriptions>;

// Relational mirror of card due dates (Yjs cells aren't DB-scannable) so the
// reminder worker can find cards due soon.
export const board_card_due_dates = pgTable('board_card_due_dates', {
  board_id: uuid('board_id').notNull(),
  card_id: text('card_id').notNull(),
  due_date: text('due_date').notNull(),
  reminded_at: timestamp('reminded_at', { withTimezone: true }),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type BoardCardDueDate = InferSelectModel<typeof board_card_due_dates>;

// ── Card file attachments (Feature: attachments) ──────────────────────────────

export const board_attachments = pgTable('board_attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  board_id: uuid('board_id').notNull(),
  card_id: text('card_id').notNull(),
  user_id: uuid('user_id').notNull(),
  file_name: text('file_name').notNull(),
  stored_filename: text('stored_filename').notNull(),
  mime_type: text('mime_type'),
  file_size: bigint('file_size', { mode: 'number' }),
  is_cover: boolean('is_cover').notNull().default(false),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type BoardAttachment = InferSelectModel<typeof board_attachments>;

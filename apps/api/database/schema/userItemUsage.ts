import { type InferSelectModel } from 'drizzle-orm';
import { integer, index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

/**
 * Per-user usage aggregate driving automatic "favourites first" ordering of
 * notebooks and agents. `item_id` is a heterogeneous string: a UUID for user
 * notebook collections, or a slug for system notebooks / agents. Upserted on
 * every use (mirrors `user_recent_values`); list endpoints read it to sort.
 */
export const userItemUsage = pgTable(
  'user_item_usage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    itemType: text('item_type').notNull(),
    itemId: text('item_id').notNull(),
    useCount: integer('use_count').notNull().default(0),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('user_item_usage_unique').on(t.userId, t.itemType, t.itemId),
    index('idx_user_item_usage_user_type').on(t.userId, t.itemType),
  ]
);

export type UserItemUsageRow = InferSelectModel<typeof userItemUsage>;

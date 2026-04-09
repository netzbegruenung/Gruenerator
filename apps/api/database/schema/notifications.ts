import { boolean, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  action_url: text('action_url'),
  group_key: text('group_key'),
  is_read: boolean('is_read').notNull().default(false),
  read_at: timestamp('read_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

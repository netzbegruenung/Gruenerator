import { type NotificationType } from '@gruenerator/contracts';
import { boolean, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull(),
  // The DB column is `text` for forward-compat (no DDL enum cast needed when
  // we add new types), but the TS type is narrowed via `$type<>()` so callers
  // get the discriminated union. The writer (NotificationService.createNotification)
  // already constrains inputs to NotificationType.
  type: text('type').$type<NotificationType>().notNull(),
  title: text('title').notNull(),
  body: text('body'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  action_url: text('action_url'),
  group_key: text('group_key'),
  is_read: boolean('is_read').notNull().default(false),
  read_at: timestamp('read_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

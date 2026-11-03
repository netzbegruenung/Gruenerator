import { type InferSelectModel } from 'drizzle-orm';
import { pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Abonnierte Kollektionen des Marktplatzes: nur die Id aus dem Client-Register
 * (F0), kein Inhalt. DDL: `migrations/zz_20261102_collection_subscriptions.sql`.
 */
export const collectionSubscriptions = pgTable(
  'collection_subscriptions',
  {
    userId: uuid('user_id').notNull(),
    collectionId: text('collection_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.collectionId] })]
);

export type CollectionSubscriptionRow = InferSelectModel<typeof collectionSubscriptions>;

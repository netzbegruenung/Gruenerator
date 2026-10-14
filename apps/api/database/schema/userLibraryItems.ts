import { type InferSelectModel } from 'drizzle-orm';
import { pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

/**
 * „Zu meinen Grüneratoren": was eine Person aus der Agentura auf ihre Übersicht
 * geholt hat. `itemRef` ist bei Agents der agentRef (Identifier eines
 * System-Agents, uuid eines Nutzer-Agents), bei Rezepten die Mention.
 * DDL: `migrations/zz_20261014_user_library_items.sql`.
 */
export const userLibraryItems = pgTable(
  'user_library_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    itemKind: text('item_kind').notNull(),
    itemRef: text('item_ref').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('user_library_items_unique').on(t.userId, t.itemKind, t.itemRef)]
);

export type UserLibraryItemRow = InferSelectModel<typeof userLibraryItems>;

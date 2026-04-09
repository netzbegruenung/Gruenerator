import { pgTable, text, timestamp, uuid, unique, index } from 'drizzle-orm/pg-core';

export const userRecentValues = pgTable(
  'user_recent_values',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id'),
    fieldType: text('field_type').notNull(),
    fieldValue: text('field_value').notNull(),
    formName: text('form_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('user_recent_values_unique').on(t.userId, t.fieldType, t.fieldValue),
    index('idx_user_recent_values_user_field').on(t.userId, t.fieldType),
  ]
);

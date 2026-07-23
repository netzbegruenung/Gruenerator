import { type InferSelectModel } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

// Websites connected to a user account. See
// migrations/create_user_websites.sql for the full rationale: this is the
// catalogue (identity + last discovery snapshot), while which categories a
// given notebook imports stays in that notebook's settings.
export const userWebsites = pgTable(
  'user_websites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id').notNull(),
    site_url: text('site_url').notNull(),
    site_name: text('site_name').notNull(),
    platform: text('platform').notNull().default('wordpress'),
    categories: jsonb('categories')
      .$type<Array<{ id: number; name: string; count: number }>>()
      .notNull()
      .default([]),
    total_posts: integer('total_posts').notNull().default(0),
    total_pages: integer('total_pages').notNull().default(0),
    discovered_at: timestamp('discovered_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('user_websites_user_url_unique').on(t.user_id, t.site_url),
    index('idx_user_websites_user_id').on(t.user_id),
  ]
);

export type UserWebsiteRow = InferSelectModel<typeof userWebsites>;

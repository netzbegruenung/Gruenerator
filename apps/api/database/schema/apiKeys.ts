import { type InferSelectModel } from 'drizzle-orm';
import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export interface ApiKeyScopes {
  permissions?: string[];
  landesverbaende?: string[] | '*';
}

export const api_keys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull(),
  key_hash: text('key_hash').notNull().unique(),
  key_prefix: text('key_prefix').notNull(),
  label: text('label').notNull(),
  scopes: jsonb('scopes').$type<ApiKeyScopes>().notNull().default({}),
  rate_limit_per_minute: integer('rate_limit_per_minute'),
  expires_at: timestamp('expires_at', { withTimezone: true }),
  last_used_at: timestamp('last_used_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revoked_at: timestamp('revoked_at', { withTimezone: true }),
});

export type ApiKey = InferSelectModel<typeof api_keys>;

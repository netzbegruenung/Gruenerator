import { type InferSelectModel } from 'drizzle-orm';
import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Vergebbare Berechtigungen. Registry statt loser Strings, damit Skript und
 * Router dieselbe Menge kennen — die Werte selbst landen als JSONB in der
 * Datenbank und sind damit F0: nur additiv erweitern, nie umbenennen.
 */
export const API_KEY_PERMISSIONS = ['notebooks:read', 'chat:completions'] as const;
export type ApiKeyPermission = (typeof API_KEY_PERMISSIONS)[number];

export function isApiKeyPermission(value: string): value is ApiKeyPermission {
  return (API_KEY_PERMISSIONS as readonly string[]).includes(value);
}

export interface ApiKeyScopes {
  /** Bleibt `string[]`: gelesen wird, was in der Datenbank steht, nicht was
   *  der aktuelle Quellstand kennt. Geprüft wird gegen `ApiKeyPermission`. */
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

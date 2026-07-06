import { type InferSelectModel } from 'drizzle-orm';
import { boolean, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Per-user registry of external MCP servers (EXPERIMENTAL).
 *
 * Tokens are stored encrypted at rest via `encryptCredential` (see
 * McpServerRegistry). `auth_type: 'oauth'` is schema-ready but the interactive
 * PKCE/DCR flow is out of scope for v1 — only `none` and `bearer` are wired
 * end-to-end. Runtime connects as the `gruenerator` role, so the migration must
 * set table ownership accordingly.
 */
export const mcp_servers = pgTable('mcp_servers', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  auth_type: text('auth_type').$type<'none' | 'bearer' | 'oauth'>().notNull().default('none'),
  token_encrypted: text('token_encrypted'),
  refresh_token_encrypted: text('refresh_token_encrypted'),
  token_expires_at: timestamp('token_expires_at', { withTimezone: true }),
  oauth_meta: jsonb('oauth_meta').$type<Record<string, unknown>>(),
  enabled: boolean('enabled').notNull().default(true),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type McpServer = InferSelectModel<typeof mcp_servers>;

import { type InferSelectModel } from 'drizzle-orm';
import { boolean, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Non-sensitive OIDC config persisted in `oauth_meta` (plaintext jsonb) so a
 * background refresh can read endpoints without decrypting. The client secret is
 * sensitive and lives in its own encrypted column, not here.
 */
export interface McpOidcConfig {
  issuer?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  registrationEndpoint?: string;
  clientId?: string;
  scheme?: 'dcr' | 'pre_registration';
  scopes?: string[];
  redirectUri?: string;
  resource?: string;
}

/**
 * Per-user registry of external MCP servers (EXPERIMENTAL).
 *
 * Tokens + client secret are encrypted at rest via `encryptCredential` (see
 * McpServerRegistry / McpOAuthService). Auth: `none`, `bearer` (static token),
 * and `oauth` (interactive PKCE/DCR flow). Runtime connects as the `gruenerator`
 * role, so the migration sets table ownership accordingly.
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
  oauth_client_secret_encrypted: text('oauth_client_secret_encrypted'),
  oauth_meta: jsonb('oauth_meta').$type<McpOidcConfig>(),
  enabled: boolean('enabled').notNull().default(true),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type McpServer = InferSelectModel<typeof mcp_servers>;

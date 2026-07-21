import { type InferSelectModel } from 'drizzle-orm';
import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { profiles } from './core.js';

/**
 * Better Auth `mcp` plugin tables (OAuth 2.1 authorization server for the
 * authenticated MCP endpoint at /api/mcp-server).
 *
 * Export keys MUST match the plugin's hardcoded model names
 * (`oauthApplication`, `oauthAccessToken`, `oauthConsent`) so the drizzle
 * adapter resolves them; property keys stay camelCase to match the plugin's
 * field names, SQL identifiers follow the `ba_` snake_case convention.
 *
 * IDs are TEXT with a DB default — `advanced.database.generateId: false`
 * delegates ID generation to Postgres (see fix_better_auth_id_defaults.sql).
 *
 * Source-of-truth migration: `database/postgres/migrations/mcp_oauth_provider_tables.sql`
 */

export const oauthApplication = pgTable(
  'ba_oauth_applications',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    icon: text('icon'),
    metadata: text('metadata'),
    clientId: text('client_id').notNull().unique(),
    clientSecret: text('client_secret'),
    redirectUrls: text('redirect_urls').notNull(),
    type: text('type').notNull(),
    disabled: boolean('disabled').default(false),
    userId: uuid('user_id').references(() => profiles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index('idx_ba_oauth_applications_user').on(table.userId),
  })
);

export const oauthAccessToken = pgTable(
  'ba_oauth_access_tokens',
  {
    id: text('id').primaryKey(),
    accessToken: text('access_token').notNull().unique(),
    refreshToken: text('refresh_token').notNull().unique(),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }).notNull(),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }).notNull(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthApplication.clientId, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => profiles.id, { onDelete: 'cascade' }),
    scopes: text('scopes').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index('idx_ba_oauth_access_tokens_user').on(table.userId),
    clientIdx: index('idx_ba_oauth_access_tokens_client').on(table.clientId),
  })
);

export const oauthConsent = pgTable(
  'ba_oauth_consents',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthApplication.clientId, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    scopes: text('scopes').notNull(),
    consentGiven: boolean('consent_given').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index('idx_ba_oauth_consents_user').on(table.userId),
    clientIdx: index('idx_ba_oauth_consents_client').on(table.clientId),
  })
);

export type OAuthApplicationRow = InferSelectModel<typeof oauthApplication>;
export type OAuthAccessTokenRow = InferSelectModel<typeof oauthAccessToken>;
export type OAuthConsentRow = InferSelectModel<typeof oauthConsent>;

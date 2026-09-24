import { type InferSelectModel } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { ba_sessions } from './auth.js';
import { profiles } from './core.js';

/**
 * `@better-auth/oauth-provider` tables, reached through `@better-auth/mcp`
 * (OAuth 2.1 AS for the MCP endpoint). 1.7 replaced the three 1.6 tables with
 * seven models; the 1.6 originals live on as `ba_oauth_*_v16` until the
 * contract migration drops them.
 *
 * Export keys and property keys MUST match the plugin's model and field names
 * — that is what the drizzle adapter resolves against; SQL identifiers follow
 * the `ba_` convention. `string[]` fields are real Postgres arrays and `json`
 * fields `jsonb`, which is what the adapter's own schema generator emits for
 * Postgres.
 *
 * Source-of-truth migration: `database/postgres/migrations/add_better_auth_v17_oauth_tables.sql`
 */

export const oauthClient = pgTable(
  'ba_oauth_clients',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id').notNull().unique(),
    /** base64url(SHA-256) — 1.7 hashes secrets, 1.6 stored them in plain text. */
    clientSecret: text('client_secret'),
    clientDiscoveryId: text('client_discovery_id'),
    disabled: boolean('disabled').default(false),
    skipConsent: boolean('skip_consent'),
    enableEndSession: boolean('enable_end_session'),
    subjectType: text('subject_type'),
    scopes: text('scopes').array(),
    clientCredentialsScopes: text('client_credentials_scopes').array(),
    userId: uuid('user_id').references(() => profiles.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    name: text('name'),
    uri: text('uri'),
    icon: text('icon'),
    contacts: text('contacts').array(),
    tos: text('tos'),
    policy: text('policy'),
    softwareId: text('software_id'),
    softwareVersion: text('software_version'),
    softwareStatement: text('software_statement'),
    redirectUris: text('redirect_uris').array().notNull(),
    postLogoutRedirectUris: text('post_logout_redirect_uris').array(),
    backchannelLogoutUri: text('backchannel_logout_uri'),
    backchannelLogoutSessionRequired: boolean('backchannel_logout_session_required'),
    tokenEndpointAuthMethod: text('token_endpoint_auth_method'),
    applicationType: text('application_type'),
    jwks: text('jwks'),
    jwksUri: text('jwks_uri'),
    grantTypes: text('grant_types').array(),
    responseTypes: text('response_types').array(),
    requirePKCE: boolean('require_pkce'),
    dpopBoundAccessTokens: boolean('dpop_bound_access_tokens').default(false),
    referenceId: text('reference_id'),
    metadata: jsonb('metadata'),
  },
  (table) => ({
    userIdx: index('idx_ba_oauth_clients_user').on(table.userId),
    discoveryIdx: index('idx_ba_oauth_clients_discovery').on(table.clientDiscoveryId),
  })
);

export const oauthResource = pgTable('ba_oauth_resources', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull().unique(),
  name: text('name').notNull(),
  accessTokenTtl: integer('access_token_ttl'),
  refreshTokenTtl: integer('refresh_token_ttl'),
  signingAlgorithm: text('signing_algorithm'),
  signingKeyId: text('signing_key_id'),
  allowedScopes: text('allowed_scopes').array(),
  customClaims: jsonb('custom_claims'),
  dpopBoundAccessTokensRequired: boolean('dpop_bound_access_tokens_required').default(false),
  disabled: boolean('disabled').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  policyVersion: integer('policy_version').default(1),
  metadata: jsonb('metadata'),
});

export const oauthClientResource = pgTable(
  'ba_oauth_client_resources',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
    resourceId: text('resource_id')
      .notNull()
      .references(() => oauthResource.identifier, { onDelete: 'cascade' }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    clientIdx: index('idx_ba_oauth_client_resources_client').on(table.clientId),
    resourceIdx: index('idx_ba_oauth_client_resources_resource').on(table.resourceId),
    /** The plugin's `alreadyLinked` idempotency leans on this being unique. */
    pairUnique: unique('ba_oauth_client_resources_pair_unique').on(
      table.clientId,
      table.resourceId
    ),
  })
);

export const oauthRefreshToken = pgTable(
  'ba_oauth_refresh_tokens',
  {
    id: text('id').primaryKey(),
    /** base64url(SHA-256) of the value handed to the client, never the value. */
    token: text('token').notNull().unique(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
    sessionId: text('session_id').references(() => ba_sessions.id, { onDelete: 'set null' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    referenceId: text('reference_id'),
    authorizationCodeId: text('authorization_code_id'),
    resources: text('resources').array(),
    requestedUserInfoClaims: text('requested_user_info_claims').array(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revoked: timestamp('revoked', { withTimezone: true }),
    rotatedAt: timestamp('rotated_at', { withTimezone: true }),
    rotationReplayResponse: text('rotation_replay_response'),
    rotationReplayExpiresAt: timestamp('rotation_replay_expires_at', { withTimezone: true }),
    authTime: timestamp('auth_time', { withTimezone: true }),
    confirmation: jsonb('confirmation'),
    scopes: text('scopes').array().notNull(),
  },
  (table) => ({
    clientIdx: index('idx_ba_oauth_refresh_tokens_client').on(table.clientId),
    sessionIdx: index('idx_ba_oauth_refresh_tokens_session').on(table.sessionId),
    userIdx: index('idx_ba_oauth_refresh_tokens_user').on(table.userId),
    codeIdx: index('idx_ba_oauth_refresh_tokens_code').on(table.authorizationCodeId),
  })
);

export const oauthAccessToken = pgTable(
  'ba_oauth_access_tokens',
  {
    id: text('id').primaryKey(),
    /**
     * Only opaque access tokens land here. With `jwt()` active the AS mints
     * JWTs instead, which resource servers verify against JWKS without a row.
     */
    token: text('token').unique(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
    sessionId: text('session_id').references(() => ba_sessions.id, { onDelete: 'set null' }),
    userId: uuid('user_id').references(() => profiles.id, { onDelete: 'cascade' }),
    referenceId: text('reference_id'),
    authorizationCodeId: text('authorization_code_id'),
    resources: text('resources').array(),
    requestedUserInfoClaims: text('requested_user_info_claims').array(),
    refreshId: text('refresh_id').references(() => oauthRefreshToken.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revoked: timestamp('revoked', { withTimezone: true }),
    confirmation: jsonb('confirmation'),
    scopes: text('scopes').array().notNull(),
  },
  (table) => ({
    clientIdx: index('idx_ba_oauth_access_tokens_client').on(table.clientId),
    sessionIdx: index('idx_ba_oauth_access_tokens_session').on(table.sessionId),
    userIdx: index('idx_ba_oauth_access_tokens_user').on(table.userId),
    codeIdx: index('idx_ba_oauth_access_tokens_code').on(table.authorizationCodeId),
    refreshIdx: index('idx_ba_oauth_access_tokens_refresh').on(table.refreshId),
  })
);

export const oauthConsent = pgTable(
  'ba_oauth_consents',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => profiles.id, { onDelete: 'cascade' }),
    referenceId: text('reference_id'),
    resources: text('resources').array(),
    requestedUserInfoClaims: text('requested_user_info_claims').array(),
    scopes: text('scopes').array().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    clientIdx: index('idx_ba_oauth_consents_client').on(table.clientId),
    userIdx: index('idx_ba_oauth_consents_user').on(table.userId),
  })
);

/**
 * Replay guard for `private_key_jwt` client assertions. The id IS the digest of
 * the assertion's `jti`, written with `forceAllowId` — so unlike every other
 * `ba_*` table this one must not lean on a database-side id default.
 */
export const oauthClientAssertion = pgTable('ba_oauth_client_assertions', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export type OAuthClientRow = InferSelectModel<typeof oauthClient>;
export type OAuthResourceRow = InferSelectModel<typeof oauthResource>;
export type OAuthClientResourceRow = InferSelectModel<typeof oauthClientResource>;
export type OAuthRefreshTokenRow = InferSelectModel<typeof oauthRefreshToken>;
export type OAuthAccessTokenRow = InferSelectModel<typeof oauthAccessToken>;
export type OAuthConsentRow = InferSelectModel<typeof oauthConsent>;
export type OAuthClientAssertionRow = InferSelectModel<typeof oauthClientAssertion>;

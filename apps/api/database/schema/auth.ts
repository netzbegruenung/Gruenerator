import { type InferSelectModel, relations } from 'drizzle-orm';
import { index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { profiles } from './core.js';

/**
 * Better Auth tables.
 *
 * Schema names (`ba_sessions`, `ba_accounts`, `ba_verification`) match the
 * `modelName` values in `apps/api/config/betterAuth.ts` so the
 * `@better-auth/drizzle-adapter` can resolve them by key.
 *
 * IDs are TEXT (not UUID) with no default — Better Auth generates them
 * itself when `advanced.database.generateId: false` (the current setting).
 * Adding `.defaultRandom()` here would silently change ID format and break
 * `tests/betterAuth.accountCreation.test.ts`.
 *
 * Source-of-truth migration: `database/postgres/migrations/add_better_auth_tables.sql`
 */

export const ba_sessions = pgTable(
  'ba_sessions',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull().unique(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    ip_address: text('ip_address'),
    user_agent: text('user_agent'),
    push_token: text('push_token'),
    device_name: text('device_name'),
    device_type: text('device_type').default('web'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    userIdx: index('idx_ba_sessions_user').on(table.user_id),
    tokenIdx: index('idx_ba_sessions_token').on(table.token),
  })
);

export const ba_accounts = pgTable(
  'ba_accounts',
  {
    id: text('id').primaryKey(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    account_id: text('account_id').notNull(),
    provider_id: text('provider_id').notNull(),
    /**
     * better-auth 1.7 keys external accounts on (issuer, accountId). Nullable
     * while 1.6.x is still writing rows without it; `backfillAccountIssuer`
     * stamps stragglers on every boot until the upgrade lands.
     */
    issuer: text('issuer'),
    access_token: text('access_token'),
    refresh_token: text('refresh_token'),
    access_token_expires_at: timestamp('access_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    id_token: text('id_token'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    userIdx: index('idx_ba_accounts_user').on(table.user_id),
    issuerAccountIdx: index('idx_ba_accounts_issuer_account').on(table.issuer, table.account_id),
    userProviderUnique: unique('ba_accounts_user_provider_unique').on(
      table.user_id,
      table.provider_id
    ),
  })
);

export const ba_verification = pgTable(
  'ba_verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    identifierIdx: index('idx_ba_verification_identifier').on(table.identifier),
  })
);

/**
 * Signing keys for the better-auth `jwt()` plugin, which 1.7 requires alongside
 * `@better-auth/mcp`: it mints the ID/access tokens and serves `/jwks`, which is
 * how resource servers verify them once the opaque-token lookup is gone.
 *
 * Export key MUST stay `jwks` — the plugin's model name; the SQL identifier
 * follows the `ba_` convention.
 *
 * Source-of-truth migration: `database/postgres/migrations/add_better_auth_v17_jwks.sql`
 */
export const jwks = pgTable('ba_jwks', {
  id: text('id').primaryKey(),
  publicKey: text('public_key').notNull(),
  privateKey: text('private_key').notNull(),
  alg: text('alg'),
  crv: text('crv'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Drizzle relations for joins. Better Auth's `findOAuthUser` issues a query
 * with `join: { user: true }` — when `experimental.joins` is enabled in
 * Better Auth options, the Drizzle adapter uses `db.query.ba_accounts.findFirst({ with: { user: true } })`,
 * which requires these `relations()` declarations to resolve the join target.
 *
 * The non-join fallback path (used when `experimental.joins` is off, the
 * current default) does not require these, but having them defined is
 * cheap and makes the schema self-documenting.
 */
export const ba_accountsRelations = relations(ba_accounts, ({ one }) => ({
  user: one(profiles, {
    fields: [ba_accounts.user_id],
    references: [profiles.id],
  }),
}));

export const ba_sessionsRelations = relations(ba_sessions, ({ one }) => ({
  user: one(profiles, {
    fields: [ba_sessions.user_id],
    references: [profiles.id],
  }),
}));

export type BaSessionRow = InferSelectModel<typeof ba_sessions>;
export type BaAccountRow = InferSelectModel<typeof ba_accounts>;
export type BaVerificationRow = InferSelectModel<typeof ba_verification>;
export type JwksRow = InferSelectModel<typeof jwks>;

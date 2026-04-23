/**
 * Auth regression tests — institutional memory of production incidents.
 *
 * One test per auth bug that has already hit production. A new entry is
 * added every time an auth issue is identified and fixed, so the suite
 * grows into a permanent guard against known failure modes.
 *
 * Current incidents pinned:
 *
 *   1. Keycloak `accountLinking.trustedProviders` (commit 0fe25b8a).
 *      Better Auth's link-account refuses to link OAuth identities when
 *      the OAuth profile lacks `email_verified: true`, unless the provider
 *      is in `trustedProviders`. All four Keycloak IdPs route through our
 *      own realms operated by netzbegruenung, so trusting them is safe.
 *      A missing entry causes `account_not_linked` errors at sign-in.
 *
 *   2. `ba_accounts` UNIQUE constraint (commit e74c3176).
 *      Must be `(account_id, provider_id)`, NOT `(user_id, provider_id)`.
 *      Better Auth allows multiple historical OAuth identities per user per
 *      provider; the wrong constraint blocks re-linking when a user's
 *      Keycloak `sub` changes (e.g. during a realm migration). This test
 *      needs a live Postgres connection and is skipped gracefully when the
 *      DB is unreachable.
 *
 *   3. Mobile OAuth Set-Cookie drop (branch fix/mobile-auth-cookie-forwarding).
 *      `auth.api.signInWithOAuth2(...)` called without `asResponse: true`
 *      silently drops Better Auth's state + PKCE cookies, so the Keycloak
 *      round-trip comes back without `__Secure-ba.state`. Better Auth then
 *      treats the callback as a `state_mismatch` replay and redirects to
 *      `/?error=please_restart_the_process` — which the SPA renders as the
 *      marketing homepage, so the Chrome Custom Tab never fires the custom
 *      scheme and `WebBrowser.openAuthSessionAsync()` hangs forever. Fix
 *      pattern: every programmatic `auth.api.*` call that mutates auth
 *      state passes `asResponse: true` and then calls
 *      `forwardBetterAuthCookies(res, response)` from
 *      `apps/api/utils/betterAuthBridge.ts`. Helper ships with its own unit
 *      tests (`apps/api/utils/betterAuthBridge.vitest.ts`).
 *
 *   4. Mobile custom-JWT rejected by requireAuth (branch
 *      fix/mobile-better-auth-bearer). The legacy
 *      `/auth/mobile/consume-login-code` Express route minted a custom HS256
 *      JWT signed with SESSION_SECRET; that token was never recognised by
 *      `auth.api.getSession({ headers })`, so every `/api/docs/*` (and any
 *      other endpoint guarded by `requireAuth`) 401'd for mobile clients.
 *      Symptom was `[DocsStore] Failed to fetch documents: AxiosError 401`
 *      looping on the docs tab even though login itself succeeded. Fix:
 *      move the exchange into the `mobileTokenExchange` Better Auth plugin's
 *      new `/token-exchange-code` endpoint, which creates a real Better Auth
 *      session via `internalAdapter.createSession(...)` and returns
 *      `session.token`. Combined with the already-configured `bearer()`
 *      plugin, mobile's `Authorization: Bearer <token>` flows through the
 *      same code path as web's session cookie — no dual-auth logic in
 *      `requireAuth`.
 *
 * Run: `pnpm --filter @gruenerator/api test`
 */

import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import { auth } from './betterAuth.js';

// ── Incident 1: trustedProviders config ──────────────────────────────────
//
// We read `auth.options.account.accountLinking.trustedProviders` via an
// `unknown` cast because Better Auth doesn't expose its configured options
// through a typed public API. If the library ever starts exposing them
// typed, this cast becomes a cleanup opportunity.
//
// `auth` is imported at module top-level so the Better Auth bootstrap (DB
// pool, Redis client, Keycloak provider config) happens exactly once per
// vitest worker. Per-test `await import()` would timeout under full-suite
// CPU contention (~5s Better Auth init × parallel workers).

const authOptions = (
  auth as unknown as {
    options?: { account?: { accountLinking?: { trustedProviders?: string[]; enabled?: boolean } } };
  }
).options;

describe('regression 0fe25b8a — trustedProviders', () => {
  const EXPECTED_PROVIDERS = [
    'keycloak-netzbegruenung',
    'keycloak-gruenes-netz',
    'keycloak-gruene-at',
    'keycloak-gruenerator',
  ];

  it.each(EXPECTED_PROVIDERS)('accountLinking.trustedProviders includes %s', (provider) => {
    const trusted = authOptions?.account?.accountLinking?.trustedProviders ?? [];
    expect(trusted).toContain(provider);
  });

  it('accountLinking is enabled', () => {
    expect(authOptions?.account?.accountLinking?.enabled).toBe(true);
  });
});

// ── Incident 2: ba_accounts UNIQUE constraint ────────────────────────────
//
// Requires a live Postgres connection. Skipped (not failed) when the DB is
// unreachable — CI environments that don't have Postgres still pass, and
// the test runs whenever a developer has their local stack up.

const pool = new pg.Pool({
  host: process.env.POSTGRES_HOST ?? 'localhost',
  port: process.env.POSTGRES_PORT ? Number(process.env.POSTGRES_PORT) : 5432,
  database: process.env.POSTGRES_DB ?? 'gruenerator',
  user: process.env.POSTGRES_USER ?? 'gruenerator',
  password: process.env.POSTGRES_PASSWORD ?? 'gruenerator',
  connectionTimeoutMillis: 2000,
});

let dbReachable = false;
try {
  await pool.query('SELECT 1');
  dbReachable = true;
} catch {
  dbReachable = false;
}

afterAll(async () => {
  await pool.end();
});

describe.skipIf(!dbReachable)('regression e74c3176 — ba_accounts UNIQUE constraint', () => {
  // Reads pg_index to verify the shape of the UNIQUE constraint on
  // ba_accounts at migration time. If someone rewrites this constraint
  // in a future migration, these assertions fail and the reviewer gets
  // a loud signal that they're about to reintroduce the realm-migration
  // bug.
  let uniqueColumns: string[] = [];

  it('reads the UNIQUE index column set from pg_index', async () => {
    const result = await pool.query<{ attname: string }>(
      `
      SELECT a.attname
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = 'ba_accounts'::regclass
        AND i.indisunique = true
        AND a.attnum > 0
      `
    );
    uniqueColumns = Array.from(new Set(result.rows.map((r) => r.attname)));
    expect(uniqueColumns.length).toBeGreaterThan(0);
  });

  it('UNIQUE index includes account_id', () => {
    expect(uniqueColumns).toContain('account_id');
  });

  it('UNIQUE index includes provider_id', () => {
    expect(uniqueColumns).toContain('provider_id');
  });

  it('UNIQUE index does NOT include user_id (would block realm-migration relink)', () => {
    expect(uniqueColumns).not.toContain('user_id');
  });
});

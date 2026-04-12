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
 * Run: `pnpm --filter @gruenerator/api test`
 */

import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

// ── Incident 1: trustedProviders config ──────────────────────────────────
//
// We read `auth.options.account.accountLinking.trustedProviders` via an
// `unknown` cast because Better Auth doesn't expose its configured options
// through a typed public API. If the library ever starts exposing them
// typed, this cast becomes a cleanup opportunity.

describe('regression 0fe25b8a — trustedProviders', () => {
  const EXPECTED_PROVIDERS = [
    'keycloak-netzbegruenung',
    'keycloak-gruenes-netz',
    'keycloak-gruene-at',
    'keycloak-gruenerator',
  ];

  it.each(EXPECTED_PROVIDERS)('accountLinking.trustedProviders includes %s', async (provider) => {
    // Import inside the test so a broken Better Auth config fails the
    // test with a clear message rather than crashing the whole file at
    // module load time.
    const { auth } = await import('./betterAuth.js');
    const trusted =
      (
        auth as unknown as {
          options?: { account?: { accountLinking?: { trustedProviders?: string[] } } };
        }
      ).options?.account?.accountLinking?.trustedProviders ?? [];

    expect(trusted).toContain(provider);
  });

  it('accountLinking is enabled', async () => {
    const { auth } = await import('./betterAuth.js');
    const enabled = (
      auth as unknown as {
        options?: { account?: { accountLinking?: { enabled?: boolean } } };
      }
    ).options?.account?.accountLinking?.enabled;

    expect(enabled).toBe(true);
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

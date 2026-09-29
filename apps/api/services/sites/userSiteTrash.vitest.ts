/**
 * One Website per user is a rule in code, not an index: a restore next to a
 * site built meanwhile must answer `conflict`, never produce a second site.
 * A subdomain someone took meanwhile is the partial unique index's 23505.
 */
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let liveSite = false;
let restoreError: unknown = null;
const statements: string[] = [];

vi.mock('../../database/services/PostgresService.js', () => {
  const run = async (sql: string) => {
    const s = sql.replace(/\s+/g, ' ').trim();
    statements.push(s);
    if (s.startsWith('SELECT id, site_title AS title, deleted_at, user_id')) {
      return [{ id: 'x', title: 'Meine Seite', deleted_at: new Date(), user_id: USER }];
    }
    if (s.startsWith('SELECT id FROM user_sites WHERE user_id = $1 AND deleted_at IS NULL')) {
      return liveSite ? [{ id: 'other-site' }] : [];
    }
    return [];
  };
  return { getPostgresInstance: () => ({ query: run }) };
});
vi.mock('../../database/services/DrizzleService.js', () => ({
  getDrizzleInstance: () => ({
    execute: async (query: SQL) => {
      const { sql } = new PgDialect().sqlToQuery(query);
      statements.push(sql.replace(/\s+/g, ' ').trim());
      if (restoreError) throw restoreError;
      return { rows: [{ id: ID }] };
    },
  }),
}));

const USER = '11111111-1111-4111-8111-111111111111';
const ID = '33333333-3333-4333-8333-333333333333';

const { restoreUserSite } = await import('./userSiteTrash.js');

beforeEach(() => {
  liveSite = false;
  restoreError = null;
  statements.length = 0;
});

describe('Website restore', () => {
  it('clears deleted_at when the user has no live Website', async () => {
    expect(await restoreUserSite(USER, ID)).toBe('ok');
    expect(statements.at(-1)).toMatch(/^UPDATE user_sites SET deleted_at = NULL/);
  });

  it('answers conflict next to a Website built meanwhile', async () => {
    liveSite = true;
    expect(await restoreUserSite(USER, ID)).toBe('conflict');
    expect(statements.some((s) => s.startsWith('UPDATE'))).toBe(false);
  });

  it('answers conflict when the subdomain was taken meanwhile (23505)', async () => {
    restoreError = Object.assign(new Error('Failed query'), { cause: { code: '23505' } });
    expect(await restoreUserSite(USER, ID)).toBe('conflict');
  });
});

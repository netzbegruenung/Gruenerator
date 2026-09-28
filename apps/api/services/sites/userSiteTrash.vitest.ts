/**
 * One Website per user is a rule in code, not an index: a restore next to a
 * site built meanwhile must answer `conflict`, never produce a second site.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

let liveSite = false;
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
  return {
    getPostgresInstance: () => ({
      query: run,
      transaction: <T>(fn: (c: { query: typeof run }) => Promise<T>) => fn({ query: run }),
    }),
  };
});

const USER = '11111111-1111-4111-8111-111111111111';
const ID = '33333333-3333-4333-8333-333333333333';

const { restoreUserSite } = await import('./userSiteTrash.js');

beforeEach(() => {
  liveSite = false;
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
});

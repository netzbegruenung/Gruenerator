/**
 * The per-account limit is a rule in code, not an index: a restore into an
 * account already at the limit must answer `conflict`. A subdomain someone took
 * meanwhile is the partial unique index's 23505.
 */
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let liveSites = 0;
let restoreError: unknown = null;
let purgeHit = true;
let access: { user_id: string | null; group_id: string | null; is_admin: boolean } | null = null;
const statements: string[] = [];
const statementParams: unknown[][] = [];
const txStatements: string[] = [];
const txParams: unknown[][] = [];

vi.mock('../../database/services/PostgresService.js', () => {
  const run = async (sql: string, params: unknown[] = []) => {
    const s = sql.replace(/\s+/g, ' ').trim();
    statements.push(s);
    statementParams.push(params);
    if (s.includes('us.deleted_at IS NOT NULL')) return access ? [access] : [];
    if (s.startsWith('DELETE FROM user_sites')) return purgeHit ? [{ id: ID }] : [];
    return [];
  };
  return { getPostgresInstance: () => ({ query: run }) };
});
vi.mock('../../database/services/DrizzleService.js', () => {
  const execute = async (query: SQL) => {
    const { sql, params } = new PgDialect().sqlToQuery(query);
    const text = sql.replace(/\s+/g, ' ').trim();
    txStatements.push(text);
    txParams.push(params);
    if (text.includes('count(*)')) return { rows: [{ n: liveSites }] };
    if (text.startsWith('UPDATE') && restoreError) throw restoreError;
    return { rows: [{ id: ID }] };
  };
  return {
    getDrizzleInstance: () => ({
      execute,
      transaction: (fn: (tx: unknown) => unknown) => fn({ execute }),
    }),
  };
});

const closeCollabRooms = vi.fn();
vi.mock('../collab/hocuspocusInternal.js', () => ({
  closeCollabRooms,
  hocuspocusInternal: vi.fn(),
  hocuspocusInternalOrNull: vi.fn(),
}));

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const GROUP = '44444444-4444-4444-8444-444444444444';
const ID = '33333333-3333-4333-8333-333333333333';

const { purgeUserSite, restoreUserSite } = await import('./userSiteTrash.js');

beforeEach(() => {
  liveSites = 0;
  restoreError = null;
  purgeHit = true;
  access = { user_id: USER, group_id: null, is_admin: true };
  statements.length = 0;
  statementParams.length = 0;
  txStatements.length = 0;
  txParams.length = 0;
  closeCollabRooms.mockReset().mockResolvedValue(undefined);
});

describe('Website restore', () => {
  it('restores as a draft in one statement, after the quota count', async () => {
    expect(await restoreUserSite(USER, ID)).toBe('ok');
    expect(txStatements.at(-1)).toMatch(
      /^UPDATE user_sites SET deleted_at = NULL, is_published = false, published_snapshot = NULL WHERE id = \$1 AND deleted_at IS NOT NULL/
    );
    expect(txStatements.some((s) => s.includes('count(*)'))).toBe(true);
  });

  it('restore does not close any room', async () => {
    await restoreUserSite(USER, ID);
    expect(closeCollabRooms).not.toHaveBeenCalled();
  });

  it('is refused for someone who is not an admin, and for a missing row', async () => {
    access = { user_id: USER, group_id: null, is_admin: false };
    expect(await restoreUserSite(USER, ID)).toBe('forbidden');
    access = null;
    expect(await restoreUserSite(USER, ID)).toBe('not_found');
    expect(txStatements).toEqual([]);
  });

  it('reads the admin right on the trashed row with the live-project rules', async () => {
    await restoreUserSite(USER, ID);
    const sqlText = statements.find((s) => s.includes('us.deleted_at IS NOT NULL')) ?? '';
    expect(sqlText).toContain("sm.role = 'admin'");
    expect(sqlText).toContain("gm.role = 'admin'");
    expect(sqlText).toContain('g.deleted_at IS NULL AND g.is_system = FALSE');
    expect(sqlText).toContain('g.archived_at IS NULL');
    expect(sqlText).toContain("us.moderation <> 'removed'");
  });

  it("counts the creator's personal sites, whoever restores", async () => {
    access = { user_id: OTHER, group_id: null, is_admin: true };
    liveSites = 24;
    expect(await restoreUserSite(USER, ID)).toBe('ok');
    expect(txStatements.some((s) => /WHERE user_id = \$1 AND group_id IS NULL/.test(s))).toBe(true);
    expect(txParams.flat()).toContain(OTHER);
  });

  it("counts a project's sites for a project site", async () => {
    access = { user_id: null, group_id: GROUP, is_admin: true };
    liveSites = 25;
    expect(await restoreUserSite(USER, ID)).toBe('conflict');
    expect(txStatements.some((s) => /WHERE group_id = \$1 AND deleted_at IS NULL/.test(s))).toBe(
      true
    );
    expect(txStatements.some((s) => s.startsWith('UPDATE'))).toBe(false);
  });

  it('answers conflict when the account is at the limit', async () => {
    liveSites = 25;
    expect(await restoreUserSite(USER, ID)).toBe('conflict');
    expect(txStatements.some((s) => s.startsWith('UPDATE'))).toBe(false);
  });

  it('answers conflict when the subdomain was taken meanwhile (23505)', async () => {
    restoreError = Object.assign(new Error('Failed query'), { cause: { code: '23505' } });
    expect(await restoreUserSite(USER, ID)).toBe('conflict');
  });
});

describe('Website purge', () => {
  it('purge deletes the Yjs rows and project shares of the site', async () => {
    expect(await purgeUserSite(ID, null)).toBe(true);
    const rowDelete = statements.findIndex((s) => s.startsWith('DELETE FROM user_sites'));
    expect(rowDelete).toBeGreaterThan(-1);
    expect(statements.slice(rowDelete + 1)).toEqual([
      'DELETE FROM yjs_document_updates WHERE document_id = $1',
      'DELETE FROM yjs_document_snapshots WHERE document_id = $1',
      "DELETE FROM group_content_shares WHERE content_type = 'user_sites' AND content_id = $1",
    ]);
    expect(statementParams.slice(rowDelete + 1)).toEqual([[ID], [ID], [ID]]);
  });

  it('closes the open site room of a purged Website, not of a missed one', async () => {
    await purgeUserSite(ID, null);
    expect(closeCollabRooms).toHaveBeenCalledWith([`site-${ID}`]);
    closeCollabRooms.mockClear();
    purgeHit = false;
    await purgeUserSite(ID, null);
    expect(closeCollabRooms).not.toHaveBeenCalled();
  });

  it('leaves the Yjs rows alone when the row was not purged', async () => {
    purgeHit = false;
    expect(await purgeUserSite(ID, null)).toBe(false);
    expect(statements.some((s) => s.includes('yjs_document'))).toBe(false);
  });
});

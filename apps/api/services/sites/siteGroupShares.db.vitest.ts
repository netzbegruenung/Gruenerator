/**
 * A Website shared into a project: taking the share back ends access at once, and the share is
 * neither a feed post nor counted as project content. Against a real PostgreSQL.
 */
import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { runMigrations } from '../../database/services/PostgresService/migrations.js';

const url = process.env.MIGRATIONS_TEST_DATABASE_URL;
let pool: pg.Pool;

const adapter = {
  get pool() {
    return pool;
  },
  ensureInitialized: async () => {},
  query: async (text: string, params?: unknown[]): Promise<unknown[]> =>
    (await pool.query<Record<string, unknown>>(text, params)).rows,
  queryOne: async (text: string, params?: unknown[]): Promise<unknown> =>
    (await pool.query<Record<string, unknown>>(text, params)).rows[0] ?? null,
};

vi.mock('../../database/services/PostgresService.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getPostgresInstance: () => adapter,
}));
vi.mock('../../database/services/PostgresService/PostgresService.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getPostgresInstance: () => adapter,
}));

const { getSiteRole } = await import('./siteAccess.js');
const { removeGroupShare, addGroupShare } = await import('../groups/groupShareWriter.js');
const { hydrateGroupContent } = await import('../groups/groupContent.js');
const { countGroupContent } = await import('../groups/groupQueries.js');

const owner = randomUUID();
const guest = randomUUID();
const group = randomUUID();
const site = randomUUID();
const closeRoom = vi.fn(async () => {});

describe.skipIf(!url)('Website shared into a project', () => {
  const dbName = `site_shares_${randomUUID().replace(/-/g, '')}`;
  const admin = new pg.Pool({ connectionString: url });

  beforeAll(async () => {
    await admin.query(`CREATE DATABASE ${dbName}`);
    const target = new URL(url!);
    target.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: target.toString() });
    expect(await runMigrations(pool)).toBe(true);
    for (const id of [owner, guest]) {
      await pool.query("INSERT INTO profiles (id, display_name) VALUES ($1, 'P')", [id]);
    }
    await pool.query("INSERT INTO groups (id, name, created_by) VALUES ($1, 'KV', $2)", [
      group,
      owner,
    ]);
    for (const [u, role] of [
      [owner, 'admin'],
      [guest, 'member'],
    ]) {
      await pool.query(
        'INSERT INTO group_memberships (group_id, user_id, role, is_active) VALUES ($1,$2,$3,TRUE)',
        [group, u, role]
      );
    }
    await pool.query(
      `INSERT INTO user_sites (id, user_id, subdomain, site_title) VALUES ($1, $2, 'kv-site', 'T')`,
      [site, owner]
    );
    await pool.query("INSERT INTO site_members (site_id, user_id, role) VALUES ($1,$2,'admin')", [
      site,
      owner,
    ]);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
  });

  it('share gives members a role; removing it closes the room and ends access', async () => {
    expect(await getSiteRole(site, guest)).toBeNull();
    const { created } = await addGroupShare({
      userId: owner,
      groupId: group,
      contentType: 'user_sites',
      contentId: site,
      permissions: { read: true, write: true },
      notify: false,
    });
    expect(created).toBe(true);
    expect(await getSiteRole(site, guest)).toBe('editor');

    const removed = await removeGroupShare(
      { groupId: group, contentType: 'user_sites', contentId: site },
      { postgres: adapter as never, closeRoom }
    );
    expect(removed).toBe(true);
    expect(closeRoom).toHaveBeenCalledWith('user_sites', site);
    expect(await getSiteRole(site, guest)).toBeNull();
  });

  it('a user_sites share is neither in the project content nor in its count', async () => {
    await addGroupShare({
      userId: owner,
      groupId: group,
      contentType: 'user_sites',
      contentId: site,
      permissions: { read: true, write: false },
      notify: false,
    });
    const content = await hydrateGroupContent(group, guest, {
      postgres: adapter as never,
      getNotebookCollectionsByIds: vi.fn(async () => []) as never,
      listUserAgentsByIds: vi.fn(async () => []) as never,
      getReactionSummaries: vi.fn(async () => new Map()) as never,
    });
    expect(Object.values(content).flat()).toEqual([]);
    expect(await countGroupContent(group)).toBe(0);
  });
});

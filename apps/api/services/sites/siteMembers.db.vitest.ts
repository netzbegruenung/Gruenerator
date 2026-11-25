/** Mitglieder schreiben mit Letzter-Admin-Regel gegen ein echtes PostgreSQL. */
import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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
  async transaction<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },
};

vi.mock('../../database/services/PostgresService.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getPostgresInstance: () => adapter,
}));
vi.mock('./userSiteTrash.js', () => ({ closeSiteRooms: vi.fn(async () => {}) }));

const { listSiteMembers, setSiteMemberRole, removeSiteMember } = await import('./siteMembers.js');

const a = randomUUID();
const b = randomUUID();
const c = randomUUID();
const spy = { closeSiteRooms: vi.fn(async (_ids: string[]) => {}) };

async function mkSite(groupId: string | null = null) {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO user_sites (id, user_id, group_id, subdomain, site_title)
     VALUES ($1, $2, $3, $4, 'T')`,
    [id, a, groupId, `s-${id.slice(0, 8)}`]
  );
  return id;
}
const member = (s: string, u: string, role: string) =>
  pool.query('INSERT INTO site_members (site_id, user_id, role) VALUES ($1,$2,$3)', [s, u, role]);
async function sharedProject(users: string[]) {
  const g = randomUUID();
  await pool.query("INSERT INTO groups (id, name) VALUES ($1, 'G')", [g]);
  for (const u of users) {
    await pool.query(
      "INSERT INTO group_memberships (group_id, user_id, role, is_active) VALUES ($1,$2,'member',TRUE)",
      [g, u]
    );
  }
  return g;
}
const roleOf = async (s: string, u: string) =>
  (await pool.query('SELECT role FROM site_members WHERE site_id=$1 AND user_id=$2', [s, u]))
    .rows[0]?.role;

describe.skipIf(!url)('Mitglieder einer Website (siteMembers)', () => {
  const dbName = `site_members_${randomUUID().replace(/-/g, '')}`;
  const adminPool = new pg.Pool({ connectionString: url });

  beforeAll(async () => {
    await adminPool.query(`CREATE DATABASE ${dbName}`);
    const target = new URL(url!);
    target.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: target.toString() });
    expect(await runMigrations(pool)).toBe(true);
    for (const id of [a, b, c]) {
      await pool.query("INSERT INTO profiles (id, display_name) VALUES ($1, 'P')", [id]);
    }
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await adminPool.end();
  });

  beforeEach(async () => {
    spy.closeSiteRooms.mockClear();
    await pool.query('DELETE FROM user_sites');
    await pool.query('DELETE FROM group_memberships');
    await pool.query('DELETE FROM groups');
  });

  it('sole admin cannot demote himself', async () => {
    const s = await mkSite();
    await member(s, a, 'admin');
    expect(
      await setSiteMemberRole({ siteId: s, actorId: a, targetId: a, role: 'editor' }, spy)
    ).toBe('last_admin');
    expect(await roleOf(s, a)).toBe('admin');
    expect(spy.closeSiteRooms).not.toHaveBeenCalled();
  });

  it('second admin present: demotion ok and rooms closed', async () => {
    const s = await mkSite();
    await member(s, a, 'admin');
    await member(s, b, 'admin');
    expect(
      await setSiteMemberRole({ siteId: s, actorId: a, targetId: a, role: 'viewer' }, spy)
    ).toBe('ok');
    expect(await roleOf(s, a)).toBe('viewer');
    expect(spy.closeSiteRooms).toHaveBeenCalledWith([s]);
  });

  it('non-last admin can leave; last admin cannot', async () => {
    const s = await mkSite();
    await member(s, a, 'admin');
    await member(s, b, 'admin');
    expect(await removeSiteMember({ siteId: s, targetId: b }, spy)).toBe('ok');
    expect(await removeSiteMember({ siteId: s, targetId: a }, spy)).toBe('last_admin');
    expect(await removeSiteMember({ siteId: s, targetId: c }, spy)).toBe('not_found');
  });

  it('project site: rule does not apply', async () => {
    const g = await sharedProject([a]);
    const s = await mkSite(g);
    await member(s, a, 'admin');
    expect(await removeSiteMember({ siteId: s, targetId: a }, spy)).toBe('ok');
  });

  it('target without shared project is not eligible; with one it is', async () => {
    const s = await mkSite();
    await member(s, a, 'admin');
    expect(
      await setSiteMemberRole({ siteId: s, actorId: a, targetId: b, role: 'editor' }, spy)
    ).toBe('not_eligible');
    await sharedProject([a, b]);
    expect(
      await setSiteMemberRole({ siteId: s, actorId: a, targetId: b, role: 'editor' }, spy)
    ).toBe('ok');
    expect(await roleOf(s, b)).toBe('editor');
  });

  it('parallel mutual demotion leaves exactly one ok and at least one admin', async () => {
    for (let i = 0; i < 10; i++) {
      await pool.query('DELETE FROM user_sites');
      const s = await mkSite();
      await member(s, a, 'admin');
      await member(s, b, 'admin');
      const res = await Promise.all([
        setSiteMemberRole({ siteId: s, actorId: a, targetId: a, role: 'viewer' }, spy),
        setSiteMemberRole({ siteId: s, actorId: b, targetId: b, role: 'viewer' }, spy),
      ]);
      expect([...res].sort()).toEqual(['last_admin', 'ok']);
      const n = await pool.query(
        "SELECT count(*)::int AS n FROM site_members WHERE site_id=$1 AND role='admin'",
        [s]
      );
      expect(n.rows[0].n).toBe(1);
    }
  });

  it('listSiteMembers merges member, project and share sources', async () => {
    const g = await sharedProject([b]);
    const s = await mkSite(g);
    await member(s, a, 'admin');
    const list = await listSiteMembers(s);
    expect(list.map((m) => [m.userId, m.role, m.source]).sort()).toEqual(
      [
        [a, 'admin', 'member'],
        [b, 'editor', 'project'],
      ].sort()
    );
  });
});

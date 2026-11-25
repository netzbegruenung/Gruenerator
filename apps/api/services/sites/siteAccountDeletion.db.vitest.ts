/** Account deletion hands sites over, and the Papierkorb shows trashed sites to every admin. */
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
};

vi.mock('../../database/services/PostgresService.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getPostgresInstance: () => adapter,
}));
vi.mock('../collab/hocuspocusInternal.js', () => ({ closeCollabRooms: vi.fn(async () => {}) }));

const { reassignSitesBeforeAccountDeletion, listTrashedUserSites, getTrashedUserSite } =
  await import('./userSiteTrash.js');

const a = randomUUID();
const b = randomUUID();
const c = randomUUID();
const d = randomUUID();

async function mkSite(creator: string | null, groupId: string | null = null) {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO user_sites (id, user_id, group_id, subdomain, site_title)
     VALUES ($1, $2, $3, $4, 'T')`,
    [id, creator, groupId, `s-${id.slice(0, 8)}`]
  );
  return id;
}
const member = (s: string, u: string, role: string, at = 'now()') =>
  pool.query(
    `INSERT INTO site_members (site_id, user_id, role, created_at) VALUES ($1,$2,$3,${at})`,
    [s, u, role]
  );
const roleOf = async (s: string, u: string) =>
  (await pool.query('SELECT role FROM site_members WHERE site_id=$1 AND user_id=$2', [s, u]))
    .rows[0]?.role;
const siteRow = async (s: string) =>
  (await pool.query('SELECT user_id FROM user_sites WHERE id=$1', [s])).rows[0];
const run = async (user: string) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const purged = await reassignSitesBeforeAccountDeletion(user, client);
    await client.query('COMMIT');
    return purged;
  } finally {
    client.release();
  }
};

describe.skipIf(!url)('Kontolöschung und Papierkorb von Websites', () => {
  const dbName = `site_acc_del_${randomUUID().replace(/-/g, '')}`;
  const adminPool = new pg.Pool({ connectionString: url });

  beforeAll(async () => {
    await adminPool.query(`CREATE DATABASE ${dbName}`);
    const target = new URL(url!);
    target.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: target.toString() });
    expect(await runMigrations(pool)).toBe(true);
    for (const id of [a, b, c, d]) {
      await pool.query("INSERT INTO profiles (id, display_name) VALUES ($1, 'P')", [id]);
    }
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await adminPool.end();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM user_sites');
    await pool.query('DELETE FROM group_content_shares');
    await pool.query('DELETE FROM group_memberships');
    await pool.query('DELETE FROM groups');
  });

  it('promotes the longest-standing member when the only admin leaves, and the site lives on', async () => {
    const s = await mkSite(a);
    await member(s, a, 'admin');
    await member(s, c, 'viewer', "now() - interval '1 day'");
    await member(s, b, 'editor', "now() - interval '5 days'");
    expect(await run(a)).toEqual([]);
    expect(await roleOf(s, b)).toBe('admin');
    expect(await roleOf(s, c)).toBe('viewer');
    expect((await siteRow(s)).user_id).toBe(b);
  });

  it('purges a site nobody else belongs to, with Yjs rows and project shares', async () => {
    const s = await mkSite(a);
    await member(s, a, 'admin');
    const g = randomUUID();
    await pool.query("INSERT INTO groups (id, name) VALUES ($1, 'G')", [g]);
    await pool.query(
      `INSERT INTO group_content_shares (content_type, content_id, group_id, shared_by_user_id)
       VALUES ('user_sites', $1, $2, $3)`,
      [s, g, a]
    );
    await pool.query(
      "INSERT INTO yjs_document_updates (document_id, update_data) VALUES ($1, '\\x00')",
      [s]
    );
    expect(await run(a)).toEqual([s]);
    expect(await siteRow(s)).toBeUndefined();
    const yjs = await pool.query('SELECT 1 FROM yjs_document_updates WHERE document_id=$1', [s]);
    expect(yjs.rows).toHaveLength(0);
    const shares = await pool.query('SELECT 1 FROM group_content_shares WHERE content_id=$1', [s]);
    expect(shares.rows).toHaveLength(0);
  });

  it('hands a personal site the leaver created to the oldest remaining admin', async () => {
    const s = await mkSite(a);
    await member(s, a, 'admin');
    await member(s, c, 'admin', "now() - interval '1 day'");
    await member(s, b, 'admin', "now() - interval '2 days'");
    await run(a);
    expect((await siteRow(s)).user_id).toBe(b);
    expect(await roleOf(s, c)).toBe('admin');
  });

  it('two co-admins deleting their accounts at once leave the site to the third admin', async () => {
    for (let i = 0; i < 5; i++) {
      const [x, y, z] = [randomUUID(), randomUUID(), randomUUID()];
      for (const u of [x, y, z]) {
        await pool.query("INSERT INTO profiles (id, display_name) VALUES ($1, 'P')", [u]);
      }
      const s = await mkSite(x);
      await member(s, y, 'admin', "now() - interval '3 days'");
      await member(s, x, 'admin', "now() - interval '2 days'");
      await member(s, z, 'admin');
      const leave = async (user: string) => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await reassignSitesBeforeAccountDeletion(user, client);
          await client.query('DELETE FROM profiles WHERE id = $1', [user]);
          await client.query('COMMIT');
        } finally {
          client.release();
        }
      };
      await Promise.all([leave(x), leave(y)]);
      expect((await siteRow(s))?.user_id).toBe(z);
    }
  });

  it('keeps a project site alive with user_id NULL', async () => {
    const g = randomUUID();
    await pool.query("INSERT INTO groups (id, name) VALUES ($1, 'G')", [g]);
    const s = await mkSite(a, g);
    await member(s, a, 'admin');
    expect(await run(a)).toEqual([]);
    expect((await siteRow(s)).user_id).toBeNull();
  });

  it('purges a trashed site with nobody left too', async () => {
    const s = await mkSite(a);
    await member(s, a, 'admin');
    await pool.query('UPDATE user_sites SET deleted_at = now() WHERE id = $1', [s]);
    expect(await run(a)).toEqual([s]);
  });

  it('lists a trashed site for every admin: members, project admins, project sites without creator', async () => {
    const g = randomUUID();
    await pool.query("INSERT INTO groups (id, name) VALUES ($1, 'G')", [g]);
    await pool.query(
      "INSERT INTO group_memberships (group_id, user_id, role, is_active) VALUES ($1,$2,'admin',TRUE), ($1,$3,'member',TRUE)",
      [g, c, d]
    );
    const personal = await mkSite(a);
    await member(personal, a, 'admin');
    await member(personal, b, 'admin');
    await member(personal, d, 'editor');
    const projectSite = await mkSite(null, g);
    await pool.query('UPDATE user_sites SET deleted_at = now()');

    const ids = async (u: string) =>
      (await listTrashedUserSites(u, { limit: 10, before: null })).map((r) => r.id);
    expect(await ids(a)).toEqual([personal]);
    expect(await ids(b)).toEqual([personal]);
    expect(await ids(d)).toEqual([]);
    expect(await ids(c)).toEqual([projectSite]);

    expect(await getTrashedUserSite(c, projectSite)).toMatchObject({ id: projectSite });
    expect(await getTrashedUserSite(d, personal)).toBe('forbidden');
    expect(await getTrashedUserSite(a, randomUUID())).toBe('not_found');
  });
});

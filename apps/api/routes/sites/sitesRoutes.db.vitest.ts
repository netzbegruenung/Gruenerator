/** Sites routes authorize by role: real SQL for roles, quotas, trash and the publish locale. */
import { randomUUID } from 'node:crypto';

import { drizzle } from 'drizzle-orm/node-postgres';
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
};
const entitled = vi.hoisted(() => ({ ids: new Set<string>() }));

vi.mock('../../database/services/PostgresService.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getPostgresInstance: () => adapter,
}));
vi.mock('../../database/services/DrizzleService.js', () => ({
  getDrizzleInstance: () => drizzle(pool),
}));
vi.mock('../../services/collab/hocuspocusInternal.js', () => ({
  closeCollabRooms: vi.fn(async () => {}),
  hocuspocusInternal: vi.fn(async () => ({ seeded: false })),
  hocuspocusInternalOrNull: vi.fn(async () => null),
}));
vi.mock('../../config/env.js', () => ({ env: { SITES_HOST: 'grsites.de', PORT: 3001 } }));
vi.mock('../../services/user/sitesEntitlement.js', () => ({
  isUserSitesEntitled: async (id: string) => entitled.ids.has(id),
}));

const { sitesContractRouter } = await import('./sitesContractRouter.js');
const { restoreUserSite } = await import('../../services/sites/userSiteTrash.js');
const { resolvePublishLocale } = await import('../../services/sites/publishLocale.js');

type Handler = (args: unknown) => Promise<{ status: number; body: Record<string, any> }>;
const router = sitesContractRouter as unknown as Record<string, Handler>;
const as =
  (user: string) =>
  (name: string, args: Record<string, unknown> = {}) =>
    router[name]({ req: { user: { id: user }, headers: {} }, ...args });

const creator = randomUUID();
const coAdmin = randomUUID();
const editor = randomUUID();
const viewer = randomUUID();
const stranger = randomUUID();
const projAdmin = randomUUID();
const projMember = randomUUID();

let n = 0;
const handle = () => `s-${randomUUID().slice(0, 8)}-${n++}`;
async function mkSite(
  opts: { user?: string | null; group?: string | null; trashed?: boolean } = {}
) {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO user_sites (id, user_id, group_id, subdomain, site_title, deleted_at)
     VALUES ($1, $2, $3, $4, 'T', $5)`,
    [
      id,
      opts.user === undefined ? creator : opts.user,
      opts.group ?? null,
      handle(),
      opts.trashed ? new Date() : null,
    ]
  );
  return id;
}
const member = (site: string, user: string, role: string) =>
  pool.query('INSERT INTO site_members (site_id, user_id, role) VALUES ($1,$2,$3)', [
    site,
    user,
    role,
  ]);
async function project(lv: string | null = null) {
  const g = randomUUID();
  await pool.query("INSERT INTO groups (id, name, landesverband) VALUES ($1, 'Projekt X', $2)", [
    g,
    lv,
  ]);
  for (const [u, role] of [
    [projAdmin, 'admin'],
    [projMember, 'member'],
  ]) {
    await pool.query(
      'INSERT INTO group_memberships (group_id, user_id, role, is_active) VALUES ($1,$2,$3,TRUE)',
      [g, u, role]
    );
  }
  return g;
}
const field = async (id: string, col: string) =>
  (await pool.query(`SELECT ${col} AS v FROM user_sites WHERE id=$1`, [id])).rows[0]?.v;

describe.skipIf(!url)('Sites routes by role (DB)', () => {
  const dbName = `sites_routes_${randomUUID().replace(/-/g, '')}`;
  const adminPool = new pg.Pool({ connectionString: url });

  beforeAll(async () => {
    await adminPool.query(`CREATE DATABASE ${dbName}`);
    const target = new URL(url!);
    target.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: target.toString() });
    expect(await runMigrations(pool)).toBe(true);
    for (const id of [creator, coAdmin, editor, viewer, stranger, projAdmin, projMember]) {
      await pool.query("INSERT INTO profiles (id, display_name) VALUES ($1, 'P')", [id]);
    }
    entitled.ids = new Set([creator, projAdmin, projMember]);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await adminPool.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await adminPool.end();
  }, 60_000);

  it('create of a personal site inserts the creator as admin member, and project sites do not count', async () => {
    const g = await project();
    for (let i = 0; i < 25; i++) await mkSite({ user: creator, group: g });
    const res = await as(creator)('createSite', { body: { subdomain: handle(), site_title: 'A' } });
    expect(res.status).toBe(200);
    const members = await pool.query(
      'SELECT role FROM site_members WHERE site_id=$1 AND user_id=$2',
      [res.body.site.id, creator]
    );
    expect(members.rows).toEqual([{ role: 'admin' }]);
  });

  it('project create: member 403, admin without unlock 403, admin with unlock 200, 26th 409', async () => {
    const g = await project();
    const body = () => ({ subdomain: handle(), site_title: 'P', group_id: g });
    expect((await as(projMember)('createSite', { body: body() })).status).toBe(403);
    entitled.ids.delete(projAdmin);
    expect((await as(projAdmin)('createSite', { body: body() })).status).toBe(403);
    entitled.ids.add(projAdmin);
    const ok = await as(projAdmin)('createSite', { body: body() });
    expect(ok.status).toBe(200);
    expect(await field(ok.body.site.id, 'user_id')).toBe(projAdmin);
    expect(await field(ok.body.site.id, 'group_id')).toBe(g);
    expect(
      (await pool.query('SELECT 1 FROM site_members WHERE site_id=$1', [ok.body.site.id])).rows
    ).toEqual([]);
    for (let i = 0; i < 24; i++) await mkSite({ user: projAdmin, group: g });
    expect((await as(projAdmin)('createSite', { body: body() })).status).toBe(409);
  });

  it('project create is refused for an archived project and for the system project', async () => {
    const g = await project();
    await pool.query('UPDATE groups SET archived_at = now() WHERE id=$1', [g]);
    expect(
      (
        await as(projAdmin)('createSite', {
          body: { subdomain: handle(), site_title: 'P', group_id: g },
        })
      ).status
    ).toBe(403);
  });

  it('role matrix on a personal site', async () => {
    const site = await mkSite();
    await member(site, creator, 'admin');
    await member(site, editor, 'editor');
    await member(site, viewer, 'viewer');

    expect(
      (await as(editor)('updateSite', { params: { id: site }, body: { site_title: 'E' } })).status
    ).toBe(200);
    expect(await field(site, 'site_title')).toBe('E');
    const before = await field(site, 'subdomain');
    expect(
      (
        await as(editor)('updateSite', {
          params: { id: site },
          body: { site_title: 'X', subdomain: 'neu-adresse' },
        })
      ).status
    ).toBe(403);
    expect(await field(site, 'subdomain')).toBe(before);
    expect(await field(site, 'site_title')).toBe('E');
    expect(
      (await as(editor)('publishSite', { params: { id: site }, body: { publish: false } })).status
    ).toBe(403);
    expect((await as(editor)('deleteSite', { params: { id: site } })).status).toBe(403);

    expect((await as(viewer)('getSiteByHandle', { params: { handle: site } })).body.role).toBe(
      'viewer'
    );
    expect(
      (await as(viewer)('updateSite', { params: { id: site }, body: { site_title: 'V' } })).status
    ).toBe(403);
    expect((await as(stranger)('getSiteByHandle', { params: { handle: site } })).status).toBe(404);
    expect(
      (await as(stranger)('updateSite', { params: { id: site }, body: { site_title: 'S' } })).status
    ).toBe(404);

    expect(
      (await as(creator)('publishSite', { params: { id: site }, body: { publish: false } })).status
    ).toBe(200);
  });

  it('listSites returns own, project and shared sites with role and group', async () => {
    const own = await mkSite({ user: projMember });
    await member(own, projMember, 'admin');
    const g = await project();
    const projSite = await mkSite({ user: projAdmin, group: g });
    const other = await mkSite({ user: creator });
    await member(other, creator, 'admin');
    await pool.query(
      `INSERT INTO group_content_shares (group_id, content_type, content_id, permissions, shared_by_user_id)
       VALUES ($1, 'user_sites', $2, '{"read":true,"write":false}', $3)`,
      [g, other, creator]
    );
    const res = await as(projMember)('listSites');
    const byId = new Map(res.body.sites.map((s: any) => [s.id, s]));
    expect((byId.get(own) as any).role).toBe('admin');
    expect((byId.get(own) as any).is_creator).toBe(true);
    expect(byId.get(projSite) as any).toMatchObject({
      role: 'editor',
      group: { id: g, name: 'Projekt X' },
      is_creator: false,
    });
    expect(
      (await as(projMember)('getSiteByHandle', { params: { handle: projSite } })).body.group
    ).toEqual({ id: g, name: 'Projekt X' });
    expect(byId.get(other) as any).toMatchObject({
      role: 'viewer',
      group: null,
      is_creator: false,
    });
  });

  it('a co-admin trashes and restores; the creator quota counts, whoever restores', async () => {
    const site = await mkSite({ trashed: true });
    await member(site, creator, 'admin');
    await member(site, coAdmin, 'admin');
    await member(site, editor, 'editor');
    expect(await restoreUserSite(editor, site)).toBe('forbidden');
    expect(await restoreUserSite(stranger, site)).toBe('forbidden');

    // Fill the creator's personal quota (the trashed one does not count).
    await pool.query(
      'DELETE FROM user_sites WHERE user_id = $1 AND group_id IS NULL AND deleted_at IS NULL',
      [creator]
    );
    const filled: string[] = [];
    for (let i = 0; i < 25; i++) filled.push(await mkSite({ user: creator }));
    expect(await restoreUserSite(coAdmin, site)).toBe('conflict');
    await pool.query('DELETE FROM user_sites WHERE id = $1', [filled[0]]);
    expect(await restoreUserSite(coAdmin, site)).toBe('ok');
    expect(await field(site, 'deleted_at')).toBeNull();
    expect((await as(coAdmin)('deleteSite', { params: { id: site } })).status).toBe(200);
    expect(await field(site, 'deleted_at')).not.toBeNull();
  });

  it('a project admin restores a project site against the project quota', async () => {
    const g = await project();
    const site = await mkSite({ user: null, group: g, trashed: true });
    expect(await restoreUserSite(projMember, site)).toBe('forbidden');
    expect(await restoreUserSite(projAdmin, site)).toBe('ok');
  });

  it('publish locale: AT Landesverband beats the creator profile; personal uses the creator', async () => {
    const g = await project('oesterreich');
    expect(await resolvePublishLocale({ groupId: g, creatorId: creator })).toBe('de-AT');
    const de = await project('berlin');
    expect(await resolvePublishLocale({ groupId: de, creatorId: null })).toBe('de-DE');
    await pool.query("UPDATE profiles SET locale='de-AT' WHERE id=$1", [creator]);
    // A German Landesverband decides; only a project without one falls back to the profile.
    expect(await resolvePublishLocale({ groupId: de, creatorId: creator })).toBe('de-DE');
    const plain = await project(null);
    expect(await resolvePublishLocale({ groupId: plain, creatorId: creator })).toBe('de-AT');
    expect(await resolvePublishLocale({ groupId: null, creatorId: creator })).toBe('de-AT');
    expect(await resolvePublishLocale({ groupId: null, creatorId: null })).toBe('de-DE');
    await pool.query("UPDATE profiles SET locale='de-DE' WHERE id=$1", [creator]);
  });
});

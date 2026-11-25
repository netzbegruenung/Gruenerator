/**
 * Rollenauflösung (`SITE_ROLE_SQL`) gegen ein echtes PostgreSQL: alle Wege, Deckel und Ausschlüsse.
 * Läuft nur mit `MIGRATIONS_TEST_DATABASE_URL` und legt sich eine eigene Datenbank an.
 */
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

const { getSiteRole, hasRole, requireSiteRole } = await import('./siteAccess.js');

const creator = randomUUID();
const person = randomUUID();

async function mkSite(opts: { groupId?: string | null; moderation?: string } = {}) {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO user_sites (id, user_id, group_id, subdomain, site_title, moderation)
     VALUES ($1, $2, $3, $4, 'T', $5)`,
    [id, creator, opts.groupId ?? null, `s-${id.slice(0, 8)}`, opts.moderation ?? 'ok']
  );
  return id;
}

async function mkGroup(opts: { system?: boolean; archived?: boolean; trashed?: boolean } = {}) {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO groups (id, name, is_system, archived_at, deleted_at)
     VALUES ($1, 'G', $2, $3, $4)`,
    [id, opts.system ?? false, opts.archived ? new Date() : null, opts.trashed ? new Date() : null]
  );
  return id;
}

async function join(groupId: string, role: 'admin' | 'member', active = true) {
  await pool.query(
    `INSERT INTO group_memberships (group_id, user_id, role, is_active) VALUES ($1, $2, $3, $4)`,
    [groupId, person, role, active]
  );
}

async function member(siteId: string, role: string) {
  await pool.query(`INSERT INTO site_members (site_id, user_id, role) VALUES ($1, $2, $3)`, [
    siteId,
    person,
    role,
  ]);
}

async function share(siteId: string, groupId: string | null, permissions: object) {
  await pool.query(
    `INSERT INTO group_content_shares (group_id, content_type, content_id, permissions)
     VALUES ($1, 'user_sites', $2, $3::jsonb)`,
    [groupId, siteId, JSON.stringify(permissions)]
  );
}

describe.skipIf(!url)('Rollenauflösung für Websites (siteAccess)', () => {
  const dbName = `site_access_${randomUUID().replace(/-/g, '')}`;
  const adminPool = new pg.Pool({ connectionString: url });

  beforeAll(async () => {
    await adminPool.query(`CREATE DATABASE ${dbName}`);
    const target = new URL(url!);
    target.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: target.toString() });
    expect(await runMigrations(pool)).toBe(true);
    for (const id of [creator, person]) {
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

  it('site_members role applies; strangers get nothing', async () => {
    const s = await mkSite();
    expect(await getSiteRole(s, person)).toBeNull();
    await member(s, 'admin');
    expect(await getSiteRole(s, person)).toBe('admin');
  });

  it('project site: project admin is admin, member is editor', async () => {
    const g = await mkGroup();
    const s = await mkSite({ groupId: g });
    await join(g, 'admin');
    expect(await getSiteRole(s, person)).toBe('admin');
    await pool.query('UPDATE group_memberships SET role = $1', ['member']);
    expect(await getSiteRole(s, person)).toBe('editor');
  });

  it('share: write true is editor, write false or missing is viewer', async () => {
    const g = await mkGroup();
    const s = await mkSite();
    await join(g, 'member');
    await share(s, g, { read: true, write: true });
    expect(await getSiteRole(s, person)).toBe('editor');
    await pool.query('DELETE FROM group_content_shares');
    await share(s, g, { read: true, write: false });
    expect(await getSiteRole(s, person)).toBe('viewer');
    await pool.query('DELETE FROM group_content_shares');
    await share(s, g, {});
    expect(await getSiteRole(s, person)).toBe('viewer');
  });

  it('project admin via share is editor, never admin', async () => {
    const g = await mkGroup();
    const s = await mkSite();
    await join(g, 'admin');
    await share(s, g, { write: true });
    expect(await getSiteRole(s, person)).toBe('editor');
  });

  it('share without group is ignored', async () => {
    const s = await mkSite();
    await share(s, null, { write: true });
    expect(await getSiteRole(s, person)).toBeNull();
  });

  it('inactive membership, trashed project and system project give nothing', async () => {
    const inactive = await mkGroup();
    const trashed = await mkGroup({ trashed: true });
    const system = await mkGroup({ system: true });
    for (const [g, active] of [
      [inactive, false],
      [trashed, true],
      [system, true],
    ] as const) {
      const s = await mkSite({ groupId: g });
      await join(g, 'admin', active);
      expect(await getSiteRole(s, person)).toBeNull();
      const shared = await mkSite();
      await share(shared, g, { write: true });
      expect(await getSiteRole(shared, person)).toBeNull();
    }
  });

  it('archived project caps ways 2 and 3 at viewer, site_members stays', async () => {
    const g = await mkGroup({ archived: true });
    await join(g, 'admin');
    const projectSite = await mkSite({ groupId: g });
    expect(await getSiteRole(projectSite, person)).toBe('viewer');
    const shared = await mkSite();
    await share(shared, g, { write: true });
    expect(await getSiteRole(shared, person)).toBe('viewer');
    await member(shared, 'admin');
    expect(await getSiteRole(shared, person)).toBe('admin');
  });

  it("moderation 'removed' caps everything at viewer", async () => {
    const s = await mkSite({ moderation: 'removed' });
    await member(s, 'admin');
    expect(await getSiteRole(s, person)).toBe('viewer');
  });

  it('trashed site gives nothing', async () => {
    const s = await mkSite();
    await member(s, 'admin');
    await pool.query('UPDATE user_sites SET deleted_at = now() WHERE id = $1', [s]);
    expect(await getSiteRole(s, person)).toBeNull();
  });

  it('highest role wins', async () => {
    const g = await mkGroup();
    const s = await mkSite({ groupId: g });
    await member(s, 'viewer');
    expect(await getSiteRole(s, person)).toBe('viewer');
    await join(g, 'admin');
    expect(await getSiteRole(s, person)).toBe('admin');
  });

  it('requireSiteRole distinguishes not_found, forbidden and ok', async () => {
    const s = await mkSite();
    expect(await requireSiteRole(s, person, 'viewer')).toBe('not_found');
    await member(s, 'editor');
    expect(await requireSiteRole(s, person, 'admin')).toBe('forbidden');
    expect(await requireSiteRole(s, person, 'editor')).toEqual({
      role: 'editor',
      groupId: null,
      creatorId: creator,
    });
  });

  it('hasRole ranks admin > editor > viewer', () => {
    expect(hasRole(null, 'viewer')).toBe(false);
    expect(hasRole('viewer', 'editor')).toBe(false);
    expect(hasRole('admin', 'editor')).toBe(true);
  });
});

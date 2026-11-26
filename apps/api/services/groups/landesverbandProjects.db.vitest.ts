/**
 * Das automatische Projekt je Landesverband gegen ein echtes PostgreSQL.
 *
 * Sicherheitsgrenze zuerst: ohne bestätigte Adresse auf der Domain des
 * Landesverbands kommt niemand hinein, auch nicht mit eingetragener Rolle, und
 * es entsteht dafür auch kein Projekt. Dann: die Rolle wird zur Adresse ergänzt
 * (ohne die übrigen Einstellungen anzufassen), Admins behalten, was sie
 * geändert haben, und ein gelöschtes Projekt kommt nicht wieder.
 *
 * Läuft nur mit `MIGRATIONS_TEST_DATABASE_URL` (CI-Job „Tests").
 */
import { randomUUID } from 'node:crypto';

import { landesverbandRecipeMentions } from '@gruenerator/shared/agents';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { runMigrations } from '../../database/services/PostgresService/migrations.js';

const url = process.env.MIGRATIONS_TEST_DATABASE_URL;
let pool: pg.Pool;

type Params = unknown[] | undefined;
const rowsOf = async (runner: pg.Pool | pg.PoolClient, text: string, params: Params) =>
  (await runner.query(text, params)).rows as Record<string, unknown>[];

/** The PostgresService surface the services use, over the test pool. */
const adapter = {
  query: (text: string, params?: unknown[]) => rowsOf(pool, text, params),
  queryOne: async (text: string, params?: unknown[]) =>
    (await rowsOf(pool, text, params))[0] ?? null,
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
  transactionQueryOne: async (client: pg.PoolClient, text: string, params?: unknown[]) =>
    (await rowsOf(client, text, params))[0] ?? null,
  transactionExec: async (client: pg.PoolClient, text: string, params?: unknown[]) => ({
    changes: (await client.query(text, params)).rowCount ?? 0,
  }),
};

vi.mock('../../database/services/PostgresService/PostgresService.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getPostgresInstance: () => adapter,
}));

const { syncLandesverbandAccess, ensureLandesverbandProjects } =
  await import('./landesverbandProjects.js');

const LGS = 'Mitarbeiter*in Landesgeschäftsstelle';
const LGS_BERLIN = { ebene: 'land', rolle: LGS, bundesland: 'Berlin' };

describe.skipIf(!url)('Landesverband-Projekte', () => {
  const dbName = `lv_projects_${randomUUID().replace(/-/g, '')}`;
  const admin = new pg.Pool({ connectionString: url });

  async function person(opts: {
    email: string | null;
    verified: boolean;
    roles?: unknown[];
    defaults?: Record<string, unknown>;
  }): Promise<string> {
    const id = randomUUID();
    const defaults = opts.defaults ?? { profile: { roles: opts.roles ?? [] } };
    await pool.query(
      `INSERT INTO profiles (id, email, email_verified, locale, user_defaults)
       VALUES ($1, $2, $3, 'de-DE', $4::jsonb)`,
      [id, opts.email, opts.verified, JSON.stringify(defaults)]
    );
    return id;
  }

  const project = async () =>
    (
      await pool.query<{ id: string; name: string; landesverband: string | null }>(
        `SELECT id, name, landesverband FROM groups WHERE auto_landesverband = 'berlin'`
      )
    ).rows;
  const shares = async (groupId: string) =>
    (
      await pool.query<{ content_type: string; content_id: string }>(
        'SELECT content_type, content_id FROM group_content_shares WHERE group_id = $1',
        [groupId]
      )
    ).rows;
  const memberships = async (userId: string) =>
    (
      await pool.query<{ group_id: string; role: string; is_active: boolean }>(
        'SELECT group_id, role, is_active FROM group_memberships WHERE user_id = $1',
        [userId]
      )
    ).rows;
  const profileOf = async (userId: string) =>
    (
      await pool.query<{
        user_defaults: { profile?: { roles?: unknown[] } } & Record<string, unknown>;
        landesverband_id: string | null;
      }>('SELECT user_defaults, landesverband_id FROM profiles WHERE id = $1', [userId])
    ).rows[0]!;

  beforeAll(async () => {
    await admin.query(`CREATE DATABASE ${dbName}`);
    const target = new URL(url!);
    target.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: target.toString() });
    expect(await runMigrations(pool)).toBe(true);
  });

  afterAll(async () => {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
  });

  describe('security boundary: the role alone never admits', () => {
    it.each([
      ['an unverified LV address', { email: 'a@gruene-berlin.de', verified: false }],
      ['a verified private address', { email: 'a@example.com', verified: true }],
      ['a verified federal-party address', { email: 'a@gruene.de', verified: true }],
      ['a verified Kreisverband subdomain', { email: 'a@kv.gruene-berlin.de', verified: true }],
      ['a verified address of another LV', { email: 'a@gruene-hessen.de', verified: true }],
      ['no address at all', { email: null, verified: true }],
    ])(
      '%s with a Berlin LGS role: no Berlin membership, no Berlin project',
      async (_label, opts) => {
        const id = await person({ ...opts, roles: [LGS_BERLIN] });
        await syncLandesverbandAccess(id);
        expect(await project()).toEqual([]);
        const berlinRows = await pool.query(
          `SELECT 1 FROM group_memberships gm JOIN groups g ON g.id = gm.group_id
          WHERE gm.user_id = $1 AND g.auto_landesverband = 'berlin'`,
          [id]
        );
        expect(berlinRows.rowCount).toBe(0);
      }
    );

    it('a verified Hessen address lands in the Hessen project only, never Berlin', async () => {
      const id = await person({ email: 'h@gruene-hessen.de', verified: true, roles: [LGS_BERLIN] });
      await syncLandesverbandAccess(id);
      const rows = await pool.query<{ auto_landesverband: string }>(
        `SELECT g.auto_landesverband FROM group_memberships gm JOIN groups g ON g.id = gm.group_id
          WHERE gm.user_id = $1`,
        [id]
      );
      expect(rows.rows.map((r) => r.auto_landesverband)).toEqual(['hessen']);
    });

    it('nobody without an eligible address is member of any automatic project', async () => {
      const rows = await pool.query<{ email: string | null; email_verified: boolean }>(
        `SELECT p.email, p.email_verified FROM group_memberships gm
           JOIN groups g ON g.id = gm.group_id JOIN profiles p ON p.id = gm.user_id
          WHERE g.auto_landesverband IS NOT NULL`
      );
      for (const r of rows.rows) {
        expect(r.email_verified).toBe(true);
        expect(r.email).toMatch(/@gruene-hessen\.de$/);
      }
    });

    it('an unverified LV address gets no role added either', async () => {
      const id = await person({ email: 'b@gruene-berlin.de', verified: false });
      await syncLandesverbandAccess(id);
      expect((await profileOf(id)).user_defaults.profile?.roles).toEqual([]);
    });
  });

  it('creates the project for the first eligible person, with recipes and notebook, as admin', async () => {
    const id = await person({ email: 'kim@gruene-berlin.de', verified: true, roles: [LGS_BERLIN] });
    await syncLandesverbandAccess(id);

    const [p] = await project();
    expect(p?.name).toBe('Grüne Berlin');
    // No LV binding: it would add the recipes back in chat after an admin removed one.
    expect(p?.landesverband).toBeNull();
    const recipes = landesverbandRecipeMentions('berlin');
    expect(recipes.length).toBeGreaterThan(0);
    expect(await shares(p!.id)).toEqual(
      expect.arrayContaining([
        { content_type: 'system_notebooks', content_id: 'berlin-notebook' },
        ...recipes.map((m) => ({ content_type: 'system_recipes', content_id: m })),
      ])
    );
    expect(await memberships(id)).toEqual([{ group_id: p!.id, role: 'admin', is_active: true }]);
    // The Berlin role was already there: nothing added.
    expect((await profileOf(id)).user_defaults.profile?.roles).toEqual([LGS_BERLIN]);
  });

  it('adds the missing LGS role once, keeps every other setting, and admits', async () => {
    const other = {
      ebene: 'kreisverband',
      rolle: 'Mitarbeiter*in Kreisverband',
      bundesland: 'Berlin',
    };
    const id = await person({
      email: 'Lee@Gruene-Berlin.de',
      verified: true,
      defaults: {
        profile: { roles: [other], favouriteColour: 'tanne' },
        sharepic: { font: 'raleway' },
      },
    });

    await syncLandesverbandAccess(id);
    await syncLandesverbandAccess(id);

    const after = await profileOf(id);
    expect(after.user_defaults.profile?.roles).toEqual([other, LGS_BERLIN]);
    expect(after.user_defaults.profile).toMatchObject({ favouriteColour: 'tanne' });
    expect(after.user_defaults).toMatchObject({ sharepic: { font: 'raleway' } });
    expect(after.landesverband_id).toBe('berlin');
    const [p] = await project();
    expect(await memberships(id)).toEqual([{ group_id: p!.id, role: 'admin', is_active: true }]);
    expect(await project()).toHaveLength(1);
  });

  it('stays idempotent when cluster workers race: one role, one project, one membership', async () => {
    const id = await person({ email: 'race@gruene-berlin.de', verified: true });
    await Promise.all(Array.from({ length: 10 }, () => syncLandesverbandAccess(id)));
    expect((await profileOf(id)).user_defaults.profile?.roles).toEqual([LGS_BERLIN]);
    expect(await project()).toHaveLength(1);
    expect(await memberships(id)).toHaveLength(1);
  });

  it('boot sweep admits eligible people only, into the same project', async () => {
    const eligible = await person({ email: 'boot@gruene-berlin.de', verified: true });
    // The SQL prefilter reads the domain case-insensitively, like the access rule.
    const upper = await person({ email: 'Boot3@GRUENE-BERLIN.DE', verified: true });
    const unverified = await person({
      email: 'boot2@gruene-berlin.de',
      verified: false,
      roles: [LGS_BERLIN],
    });

    await ensureLandesverbandProjects();

    const [p] = await project();
    expect(await project()).toHaveLength(1);
    expect(await memberships(eligible)).toEqual([
      { group_id: p!.id, role: 'admin', is_active: true },
    ]);
    expect(await memberships(upper)).toEqual([{ group_id: p!.id, role: 'admin', is_active: true }]);
    expect(await memberships(unverified)).toEqual([]);
  });

  it('keeps what admins changed: removed recipe, left member, new name', async () => {
    const id = await person({ email: 'keep@gruene-berlin.de', verified: true });
    await syncLandesverbandAccess(id);
    const [p] = await project();
    const [first] = landesverbandRecipeMentions('berlin');
    await pool.query('DELETE FROM group_content_shares WHERE group_id = $1 AND content_id = $2', [
      p!.id,
      first,
    ]);
    await pool.query(
      'UPDATE group_memberships SET is_active = FALSE WHERE group_id = $1 AND user_id = $2',
      [p!.id, id]
    );
    await pool.query(`UPDATE groups SET name = 'LGS Berlin' WHERE id = $1`, [p!.id]);

    await syncLandesverbandAccess(id);
    await ensureLandesverbandProjects();

    expect((await project())[0]?.name).toBe('LGS Berlin');
    expect((await shares(p!.id)).some((s) => s.content_id === first)).toBe(false);
    expect(await memberships(id)).toEqual([{ group_id: p!.id, role: 'admin', is_active: false }]);
  });

  it('does not recreate a project its admins put into the trash', async () => {
    const [p] = await project();
    await pool.query('UPDATE groups SET deleted_at = NOW() WHERE id = $1', [p!.id]);
    const newcomer = await person({ email: 'late@gruene-berlin.de', verified: true });

    await syncLandesverbandAccess(newcomer);

    expect(await project()).toHaveLength(1);
    expect(await memberships(newcomer)).toEqual([]);
  });
});

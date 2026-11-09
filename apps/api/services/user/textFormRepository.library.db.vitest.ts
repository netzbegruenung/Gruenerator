/**
 * `listVisibleTextFormsByIds` gegen ein echtes PostgreSQL: was ein gespeichertes
 * Rezept im Katalog des Modells sichtbar macht — und was nicht.
 *
 * Läuft nur mit `MIGRATIONS_TEST_DATABASE_URL` (CI-Job „Tests") und legt sich
 * wie `marketplaceService.db.vitest.ts` eine eigene Datenbank an.
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
};

vi.mock('../../database/services/PostgresService/PostgresService.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getPostgresInstance: () => adapter,
}));

const { listVisibleTextFormsByIds } = await import('./textFormRepository.js');

const me = randomUUID();
const author = randomUUID();

describe.skipIf(!url)('listVisibleTextFormsByIds', () => {
  const dbName = `tflib_${randomUUID().replace(/-/g, '')}`;
  const admin = new pg.Pool({ connectionString: url });

  async function insertRecipe(over: Record<string, unknown> = {}): Promise<string> {
    const row = {
      user_id: author,
      kind: 'custom',
      mention: `rezept-${randomUUID().slice(0, 8)}`,
      title: 'Fremdes Rezept',
      style_block: 'Stil.',
      share_mode: 'authenticated',
      is_public: true,
      moderation: 'ok',
      ...over,
    };
    const cols = Object.keys(row);
    const res = await pool.query<{ id: string }>(
      `INSERT INTO user_text_forms (${cols.join(', ')})
       VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
      Object.values(row)
    );
    return res.rows[0].id;
  }

  beforeAll(async () => {
    await admin.query(`CREATE DATABASE ${dbName}`);
    const target = new URL(url!);
    target.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: target.toString() });
    expect(await runMigrations(pool)).toBe(true);
    await pool.query('INSERT INTO profiles (id, display_name) VALUES ($1, $2), ($3, $4)', [
      me,
      'Ich',
      author,
      'Jamila',
    ]);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
  });

  it('returns a public recipe of someone else, with its owner', async () => {
    const id = await insertRecipe();
    const rows = await listVisibleTextFormsByIds(me, [id]);
    expect(rows.map((r) => r.id)).toEqual([id]);
    expect(rows[0]?.ownerName).toBe('Jamila');
  });

  it('does not return a trashed, hidden or private recipe, nor unknown ids', async () => {
    const trashed = await insertRecipe({ deleted_at: new Date() });
    const hidden = await insertRecipe({ moderation: 'hidden' });
    const privat = await insertRecipe({ is_public: false, share_mode: 'private' });
    const visible = await insertRecipe();
    const rows = await listVisibleTextFormsByIds(me, [
      trashed,
      hidden,
      privat,
      visible,
      randomUUID(),
      'kein-uuid',
    ]);
    expect(rows.map((r) => r.id)).toEqual([visible]);
  });

  it('returns nothing for an empty or non-uuid list', async () => {
    expect(await listVisibleTextFormsByIds(me, [])).toEqual([]);
    expect(await listVisibleTextFormsByIds(me, ['presse'])).toEqual([]);
  });
});

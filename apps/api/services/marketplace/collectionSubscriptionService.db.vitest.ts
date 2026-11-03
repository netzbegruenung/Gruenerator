/**
 * Abonnierte Kollektionen gegen ein echtes PostgreSQL: Idempotenz, Filter für
 * Ids, die das Enum nicht mehr kennt, und die Kaskade mit dem Profil.
 *
 * Läuft nur mit `MIGRATIONS_TEST_DATABASE_URL` (CI-Job „Tests") und legt sich
 * wie `marketplaceService.db.vitest.ts` eine eigene Datenbank an.
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

vi.mock('../../database/services/PostgresService/PostgresService.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getPostgresInstance: () => adapter,
}));

const { listSubscribedCollectionIds, subscribeCollection, unsubscribeCollection } =
  await import('./collectionSubscriptionService.js');

const me = randomUUID();

describe.skipIf(!url)('Kollektions-Abos (collectionSubscriptionService)', () => {
  const dbName = `collsubs_${randomUUID().replace(/-/g, '')}`;
  const admin = new pg.Pool({ connectionString: url });

  beforeAll(async () => {
    await admin.query(`CREATE DATABASE ${dbName}`);
    const target = new URL(url!);
    target.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: target.toString() });
    expect(await runMigrations(pool)).toBe(true);
    await pool.query('INSERT INTO profiles (id, display_name) VALUES ($1, $2)', [me, 'Ich']);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM collection_subscriptions');
  });

  it('subscribe twice keeps one row', async () => {
    await subscribeCollection(me, 'mustergruen-wahlkampf');
    await subscribeCollection(me, 'mustergruen-wahlkampf');
    expect(await listSubscribedCollectionIds(me)).toEqual(['mustergruen-wahlkampf']);
  });

  it('unsubscribe unknown is a no-op', async () => {
    await expect(unsubscribeCollection(me, 'queer')).resolves.toBeUndefined();
    expect(await listSubscribedCollectionIds(me)).toEqual([]);
  });

  it('ignores ids the enum no longer knows', async () => {
    await pool.query(
      `INSERT INTO collection_subscriptions (user_id, collection_id) VALUES ($1, 'abgeschafft')`,
      [me]
    );
    expect(await listSubscribedCollectionIds(me)).toEqual([]);
  });

  it('cascades with the profile', async () => {
    const gone = randomUUID();
    await pool.query('INSERT INTO profiles (id, display_name) VALUES ($1, $2)', [gone, 'Weg']);
    await subscribeCollection(gone, 'queer');
    await pool.query('DELETE FROM profiles WHERE id = $1', [gone]);
    const res = await pool.query('SELECT 1 FROM collection_subscriptions WHERE user_id = $1', [
      gone,
    ]);
    expect(res.rowCount).toBe(0);
  });
});

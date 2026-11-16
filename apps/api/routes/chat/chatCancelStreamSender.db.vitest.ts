/**
 * `isStreamTurnSender`: B cannot cancel A's turn, A can, the thread owner can
 * for a legacy row without user_id. Läuft nur mit `MIGRATIONS_TEST_DATABASE_URL`.
 */
import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { runMigrations } from '../../database/services/PostgresService/migrations.js';

const url = process.env.MIGRATIONS_TEST_DATABASE_URL;
let pool: pg.Pool;
const adapter = {
  query: async (text: string, params?: unknown[]): Promise<unknown[]> =>
    (await pool.query<Record<string, unknown>>(text, params)).rows,
};
vi.mock('../../database/services/PostgresService/PostgresService.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getPostgresInstance: () => adapter,
}));
vi.mock('../../database/services/PostgresService.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getPostgresInstance: () => adapter,
}));

const { isStreamTurnSender } = await import('./services/threadPersistenceService.js');

const ada = randomUUID();
const bea = randomUUID();
const thread = randomUUID();
const legacyThread = randomUUID();
const adaTurn = randomUUID();
const beaTurn = randomUUID();
const legacyTurn = randomUUID();

describe.skipIf(!url)('isStreamTurnSender', () => {
  const dbName = `cancelsender_${randomUUID().replace(/-/g, '')}`;
  const admin = new pg.Pool({ connectionString: url });

  beforeAll(async () => {
    await admin.query(`CREATE DATABASE ${dbName}`);
    const target = new URL(url!);
    target.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: target.toString() });
    expect(await runMigrations(pool)).toBe(true);
    await pool.query('INSERT INTO profiles (id, display_name) VALUES ($1, $2), ($3, $4)', [
      ada,
      'Ada',
      bea,
      'Bea',
    ]);
    await pool.query(
      `INSERT INTO chat_threads (id, user_id, title) VALUES ($1, $2, 'T'), ($3, $2, 'L')`,
      [thread, ada, legacyThread]
    );
    const at = (s: number) => new Date(Date.UTC(2026, 10, 16, 10, 0, s));
    const row = (id: string, t: string, role: string, user: string | null, s: number) =>
      pool.query(
        `INSERT INTO chat_messages (id, thread_id, role, user_id, content, created_at)
         VALUES ($1, $2, $3, $4, 'x', $5)`,
        [id, t, role, user, at(s)]
      );
    await row(randomUUID(), thread, 'user', ada, 1);
    await row(adaTurn, thread, 'assistant', null, 2);
    await row(randomUUID(), thread, 'user', bea, 3);
    await row(beaTurn, thread, 'assistant', null, 4);
    await row(randomUUID(), legacyThread, 'user', null, 1);
    await row(legacyTurn, legacyThread, 'assistant', null, 2);
  });

  afterAll(async () => {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
  });

  it('the sender may, a teammate may not', async () => {
    expect(await isStreamTurnSender(adaTurn, ada)).toBe(true);
    expect(await isStreamTurnSender(adaTurn, bea)).toBe(false);
    expect(await isStreamTurnSender(beaTurn, bea)).toBe(true);
    expect(await isStreamTurnSender(beaTurn, ada)).toBe(false);
  });

  it('a legacy user row without user_id counts as the thread owner', async () => {
    expect(await isStreamTurnSender(legacyTurn, ada)).toBe(true);
    expect(await isStreamTurnSender(legacyTurn, bea)).toBe(false);
  });

  it('an unknown stream is refused', async () => {
    expect(await isStreamTurnSender(randomUUID(), ada)).toBe(false);
  });
});

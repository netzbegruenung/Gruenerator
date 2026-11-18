/**
 * #5675: Angeheftete Refs eines Threads gelten pro Person. Die Besitzerin
 * behält die Spalten am Thread, jedes Mitglied eines Team-Chats bekommt eine
 * eigene Zeile in `chat_thread_member_refs` — niemand erbt oder überschreibt
 * die Auswahl einer anderen Person.
 *
 * Läuft nur mit `MIGRATIONS_TEST_DATABASE_URL` (CI-Job „Tests").
 */
import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { runMigrations } from '../../../database/services/PostgresService/migrations.js';

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

vi.mock('../../../database/services/PostgresService.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getPostgresInstance: () => adapter,
}));
vi.mock(
  '../../../database/services/PostgresService/PostgresService.js',
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    getPostgresInstance: () => adapter,
  })
);

const {
  getThreadLastMcpServer,
  getThreadMentionRefs,
  getThreadNotebookSources,
  setThreadLastMcpServer,
  setThreadMentionRefs,
} = await import('./threadPersistenceService.js');

const A = randomUUID(); // owner
const B = randomUUID(); // member
const T = randomUUID();
const TRASHED = randomUUID();
const DOC_A = randomUUID();
const DOC_B = randomUUID();
const DOC_B2 = randomUUID();

const refs = (docs: string[]) => ({ texts: [], docs, links: [] });

describe.skipIf(!url)('Thread-Refs pro Person', () => {
  const dbName = `memberrefs_${randomUUID().replace(/-/g, '')}`;
  const admin = new pg.Pool({ connectionString: url });

  beforeAll(async () => {
    await admin.query(`CREATE DATABASE ${dbName}`);
    const target = new URL(url!);
    target.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: target.toString() });
    expect(await runMigrations(pool)).toBe(true);
    await pool.query(`INSERT INTO profiles (id, display_name) VALUES ($1,'A'), ($2,'B')`, [A, B]);
    await pool.query(`INSERT INTO chat_threads (id, user_id) VALUES ($1,$2), ($3,$2)`, [
      T,
      A,
      TRASHED,
    ]);
    await pool.query(`UPDATE chat_threads SET deleted_at = now() WHERE id = $1`, [TRASHED]);
  });

  afterAll(async () => {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
  });

  it('the owner keeps the columns on chat_threads', async () => {
    await setThreadMentionRefs(T, A, refs([DOC_A]));
    const row = await pool.query(`SELECT mention_refs FROM chat_threads WHERE id = $1`, [T]);
    expect(row.rows[0].mention_refs.docs).toEqual([DOC_A]);
    expect((await getThreadMentionRefs(T, A)).docs).toEqual([DOC_A]);
  });

  it("a member neither inherits nor overwrites the owner's picks", async () => {
    expect((await getThreadMentionRefs(T, B)).docs).toEqual([]);
    await setThreadMentionRefs(T, B, refs([DOC_B]));
    expect((await getThreadMentionRefs(T, B)).docs).toEqual([DOC_B]);
    expect((await getThreadMentionRefs(T, A)).docs).toEqual([DOC_A]);

    await setThreadMentionRefs(T, B, refs([DOC_B2, DOC_B]));
    expect((await getThreadMentionRefs(T, B)).docs).toEqual([DOC_B2, DOC_B]);
    const rows = await pool.query(
      `SELECT user_id FROM chat_thread_member_refs WHERE thread_id = $1`,
      [T]
    );
    expect(rows.rows.map((r) => r.user_id)).toEqual([B]);
  });

  it('a member clearing their picks leaves the others alone', async () => {
    await setThreadMentionRefs(T, B, refs([]));
    expect((await getThreadMentionRefs(T, B)).docs).toEqual([]);
    expect((await getThreadMentionRefs(T, A)).docs).toEqual([DOC_A]);
    expect(await getThreadNotebookSources(T, B)).toEqual([]);
  });

  it('the sticky connector is per person', async () => {
    await setThreadLastMcpServer(T, A, 'server-a');
    await setThreadLastMcpServer(T, B, 'server-b');
    expect(await getThreadLastMcpServer(T, A)).toBe('server-a');
    expect(await getThreadLastMcpServer(T, B)).toBe('server-b');
  });

  it('a trashed thread takes no member row and reads empty', async () => {
    await setThreadMentionRefs(TRASHED, B, refs([DOC_B]));
    const rows = await pool.query(`SELECT 1 FROM chat_thread_member_refs WHERE thread_id = $1`, [
      TRASHED,
    ]);
    expect(rows.rowCount).toBe(0);
    expect((await getThreadMentionRefs(TRASHED, A)).docs).toEqual([]);
  });
});

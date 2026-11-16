/**
 * Die Autorenregel für Bearbeiten/Neu-Beantworten gegen ein echtes PostgreSQL:
 * Prüfung und Löschung sind EIN Statement, also muss „nichts gelöscht" bei
 * 'not_author' hier mit Zeilenzahlen belegt werden, nicht mit SQL-Form.
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

vi.mock(
  '../../../database/services/PostgresService/PostgresService.js',
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    getPostgresInstance: () => adapter,
  })
);

const { deleteMessagesFrom, deleteTrailingAssistant } =
  await import('./threadPersistenceService.js');

const A = randomUUID();
const B = randomUUID();

async function profile(id: string): Promise<void> {
  await pool.query(`INSERT INTO profiles (id, email) VALUES ($1, $2)`, [
    id,
    `${id}@example.invalid`,
  ]);
}

/** Rows get strictly increasing created_at so the cut is deterministic. */
async function thread(
  rows: Array<[role: 'user' | 'assistant', author: string | null]>,
  opts: { trashed?: boolean; team?: boolean | 'read-only' } = {}
): Promise<{ id: string; ids: string[] }> {
  const id = randomUUID();
  await pool.query(`INSERT INTO chat_threads (id, user_id) VALUES ($1, $2)`, [id, A]);
  if (opts.team) {
    const g = randomUUID();
    await pool.query(`INSERT INTO groups (id, name) VALUES ($1, 'P')`, [g]);
    await pool.query(
      `INSERT INTO group_content_shares (group_id, shared_by_user_id, content_type, content_id, permissions)
       VALUES ($1, $2, 'chat_threads', $3, $4::jsonb)`,
      [g, A, id, JSON.stringify({ read: true, write: opts.team !== 'read-only' })]
    );
  }
  const ids: string[] = [];
  for (const [i, [role, author]] of rows.entries()) {
    const mid = randomUUID();
    ids.push(mid);
    await pool.query(
      `INSERT INTO chat_messages (id, thread_id, role, user_id, content, created_at)
       VALUES ($1, $2, $3, $4, 'x', now() + ($5 || ' seconds')::interval)`,
      [mid, id, role, author, String(i)]
    );
  }
  if (opts.trashed)
    await pool.query(`UPDATE chat_threads SET deleted_at = now() WHERE id = $1`, [id]);
  return { id, ids };
}

const count = async (threadId: string): Promise<number> =>
  Number(
    (await pool.query('SELECT COUNT(*) AS n FROM chat_messages WHERE thread_id = $1', [threadId]))
      .rows[0].n
  );

describe.skipIf(!url)('threadPersistenceService author rule gegen Postgres', () => {
  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url });
    expect(await runMigrations(pool)).toBe(true);
    await profile(A);
    await profile(B);
  });
  afterAll(async () => {
    await pool?.end();
  });

  it("B regenerates after A's message: 'not_author', nothing deleted", async () => {
    const t = await thread([
      ['user', A],
      ['assistant', A],
    ]);
    await expect(deleteTrailingAssistant(t.id, B)).resolves.toBe('not_author');
    expect(await count(t.id)).toBe(2);
  });

  it('A regenerates her own turn: deletes the reply', async () => {
    const t = await thread([
      ['user', A],
      ['assistant', A],
    ]);
    await expect(deleteTrailingAssistant(t.id, A)).resolves.toBe(1);
    expect(await count(t.id)).toBe(1);
  });

  it('B regenerates their own turn after A: deletes 1', async () => {
    const t = await thread([
      ['user', A],
      ['assistant', A],
      ['user', B],
      ['assistant', B],
    ]);
    await expect(deleteTrailingAssistant(t.id, B)).resolves.toBe(1);
    expect(await count(t.id)).toBe(3);
  });

  it("team chat: A edits her earlier message after B replied: 'not_author', nothing deleted", async () => {
    const t = await thread(
      [
        ['user', A],
        ['assistant', A],
        ['user', B],
        ['assistant', B],
      ],
      { team: true }
    );
    await expect(deleteMessagesFrom(t.id, t.ids[0], A)).resolves.toBe('not_author');
    expect(await count(t.id)).toBe(4);
  });

  it('A edits her last own message: deletes it and the reply', async () => {
    const t = await thread([
      ['user', A],
      ['assistant', A],
      ['user', B],
      ['assistant', B],
      ['user', A],
      ['assistant', A],
    ]);
    await expect(deleteMessagesFrom(t.id, t.ids[4], A)).resolves.toBe(2);
    expect(await count(t.id)).toBe(4);
  });

  it('owner edits a legacy NULL row with no foreign rows after it', async () => {
    const t = await thread([
      ['user', null],
      ['assistant', null],
    ]);
    await expect(deleteMessagesFrom(t.id, t.ids[0], A)).resolves.toBe(2);
    expect(await count(t.id)).toBe(0);
  });

  it("non-owner edit of a legacy NULL row: 'not_author'", async () => {
    const t = await thread([
      ['user', null],
      ['assistant', null],
    ]);
    await expect(deleteMessagesFrom(t.id, t.ids[0], B)).resolves.toBe('not_author');
    expect(await count(t.id)).toBe(2);
  });

  it('an assistant row is no valid anchor', async () => {
    const t = await thread([
      ['user', A],
      ['assistant', null],
    ]);
    await expect(deleteMessagesFrom(t.id, t.ids[1], A)).resolves.toBe(0);
    expect(await count(t.id)).toBe(2);
  });

  it('unknown anchor: 0', async () => {
    const t = await thread([
      ['user', A],
      ['assistant', A],
    ]);
    await expect(deleteMessagesFrom(t.id, randomUUID(), A)).resolves.toBe(0);
    expect(await count(t.id)).toBe(2);
  });

  describe('without a write-capable group share (fork, person-shared, read-only share)', () => {
    const foreign: Array<['user' | 'assistant', string]> = [
      ['user', B],
      ['assistant', B],
    ];

    it('fork-like: the owner replaces turns authored by someone else', async () => {
      const t = await thread(foreign);
      await expect(deleteTrailingAssistant(t.id, A)).resolves.toBe(1);
      const t2 = await thread(foreign);
      await expect(deleteMessagesFrom(t2.id, t2.ids[0], A)).resolves.toBe(2);
      expect(await count(t2.id)).toBe(0);
    });

    it('the owner may edit her earlier message after a person-share peer replied', async () => {
      const t = await thread([
        ['user', A],
        ['assistant', A],
        ['user', B],
        ['assistant', B],
      ]);
      await expect(deleteMessagesFrom(t.id, t.ids[0], A)).resolves.toBe(4);
    });

    it('a read-only group share does not make it a team chat', async () => {
      const t = await thread(foreign, { team: 'read-only' });
      await expect(deleteTrailingAssistant(t.id, A)).resolves.toBe(1);
    });

    it('a non-owner non-author is still refused', async () => {
      const t = await thread([
        ['user', A],
        ['assistant', A],
      ]);
      await expect(deleteTrailingAssistant(t.id, B)).resolves.toBe('not_author');
      await expect(deleteMessagesFrom(t.id, t.ids[0], B)).resolves.toBe('not_author');
      expect(await count(t.id)).toBe(2);
    });
  });

  it('team chat: the owner may not replace a teammate turn', async () => {
    const t = await thread(
      [
        ['user', B],
        ['assistant', B],
      ],
      { team: true }
    );
    await expect(deleteTrailingAssistant(t.id, A)).resolves.toBe('not_author');
    await expect(deleteMessagesFrom(t.id, t.ids[0], A)).resolves.toBe('not_author');
    expect(await count(t.id)).toBe(2);
  });

  it('trashed thread: both return 0 and delete nothing', async () => {
    const t = await thread(
      [
        ['user', A],
        ['assistant', A],
      ],
      { trashed: true }
    );
    await expect(deleteTrailingAssistant(t.id, A)).resolves.toBe(0);
    await expect(deleteMessagesFrom(t.id, t.ids[0], A)).resolves.toBe(0);
    expect(await count(t.id)).toBe(2);
  });
});

/**
 * #5678: Ein Team-Chat bleibt beim Projekt. Wer als Besitzer*in austritt,
 * verliert ihn samt Besitzerrechten; ein privater Projekt-Chat bleibt, und ein
 * gelöschtes Projekt gibt den Team-Chat zurück.
 *
 * Läuft nur mit `MIGRATIONS_TEST_DATABASE_URL` (CI-Job „Tests").
 */
import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { runMigrations } from '../../../database/services/PostgresService/migrations.js';
import { ThreadId, UserId } from '../../../utils/types/branded.js';

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
vi.mock('../../../services/chat/threadRecallEmbeddingService.js', () => ({
  searchThreadRecall: async () => [TEAM, PRIVATE],
}));
vi.mock('../../../services/groups/groupContent.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  hydrateGroupContent: async () => null,
}));

const { getThreadAccessLevel } = await import('./threadAccessService.js');
const { getThreadRecallContext, recallPastChats } = await import('./pastChatRecallService.js');

const A = randomUUID(); // owner of both chats
const B = randomUUID(); // stays in the project
const P = randomUUID();
const TEAM = randomUUID();
const PRIVATE = randomUUID();

const level = (t: string, u: string) => getThreadAccessLevel(ThreadId(t), UserId(u));

describe.skipIf(!url)('Besitzer*in verlässt das Projekt eines Team-Chats', () => {
  const dbName = `ownerleft_${randomUUID().replace(/-/g, '')}`;
  const admin = new pg.Pool({ connectionString: url });

  beforeAll(async () => {
    await admin.query(`CREATE DATABASE ${dbName}`);
    const target = new URL(url!);
    target.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: target.toString() });
    expect(await runMigrations(pool)).toBe(true);
    await pool.query(`INSERT INTO profiles (id, display_name) VALUES ($1,'A'), ($2,'B')`, [A, B]);
    await pool.query(
      `INSERT INTO groups (id, name, created_by, is_system) VALUES ($1,'Projekt P',$2,false)`,
      [P, A]
    );
    await pool.query(
      `INSERT INTO group_memberships (group_id, user_id, role, is_active)
       VALUES ($1,$2,'admin',TRUE), ($1,$3,'member',TRUE)`,
      [P, A, B]
    );
    for (const [id, title] of [
      [TEAM, 'Team'],
      [PRIVATE, 'Privat'],
    ] as const) {
      await pool.query(
        `INSERT INTO chat_threads (id, user_id, title, group_id) VALUES ($1,$2,$3,$4)`,
        [id, A, title, P]
      );
    }
    await pool.query(
      `INSERT INTO group_content_shares (group_id, content_type, content_id, shared_by_user_id, permissions)
       VALUES ($1,'chat_threads',$2,$3,'{"read":true,"write":true}')`,
      [P, TEAM, A]
    );
  });

  afterAll(async () => {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
  });

  it('while a member, the owner owns both chats', async () => {
    expect(await level(TEAM, A)).toBe('owner');
    expect(await level(PRIVATE, A)).toBe('owner');
    expect(await level(TEAM, B)).toBe('write');
  });

  it('after leaving, the team chat is gone for the owner and stays with the team', async () => {
    await pool.query(
      `UPDATE group_memberships SET is_active = FALSE WHERE group_id = $1 AND user_id = $2`,
      [P, A]
    );
    expect(await level(TEAM, A)).toBe('none');
    expect(await level(TEAM, B)).toBe('write');
    expect(await level(PRIVATE, A)).toBe('owner');

    expect(await getThreadRecallContext(TEAM, A)).toBeNull();
    const hits = await recallPastChats(A, 'zzz-no-keyword-match', { limit: 10 });
    expect(hits.map((h) => h.threadId)).toEqual([PRIVATE]);
  });

  it('a deleted project gives the team chat back to its owner', async () => {
    await pool.query(`UPDATE groups SET deleted_at = now() WHERE id = $1`, [P]);
    expect(await level(TEAM, A)).toBe('owner');
    await pool.query(`UPDATE groups SET deleted_at = NULL WHERE id = $1`, [P]);
  });
});

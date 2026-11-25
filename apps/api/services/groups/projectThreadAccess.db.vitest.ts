/**
 * Projektmaterial nach Mitgliedschaft gegen ein echtes PostgreSQL: Anweisungen,
 * Dateien und Geschwister-Chats erreichen jedes aktive Mitglied in einem
 * Team-Chat, nie aber den privaten Chat eines anderen Mitglieds.
 *
 * Läuft nur mit `MIGRATIONS_TEST_DATABASE_URL` (CI-Job „Tests").
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
  queryOne: async (text: string, params?: unknown[]): Promise<unknown> =>
    (await pool.query<Record<string, unknown>>(text, params)).rows[0] ?? null,
};

vi.mock('../../database/services/PostgresService.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getPostgresInstance: () => adapter,
}));
vi.mock('../../database/services/PostgresService/PostgresService.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getPostgresInstance: () => adapter,
}));
vi.mock('../chat/threadRecallEmbeddingService.js', () => ({
  searchThreadRecall: async () => [T1, T2, T3],
}));
vi.mock('./groupContent.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  hydrateGroupContent: async () => null,
}));

const { readThreadProjectInstructions } = await import('./groupInstructions.js');
const { getProjectFileDocumentIds } = await import('./projectFiles.js');
const { getSpaceRecallScope, getThreadRecallContext, recallPastChats } =
  await import('../../routes/chat/services/pastChatRecallService.js');
const { getTrashedThread, listTrashedThreads } =
  await import('../../routes/chat/services/threadTrashService.js');
const { expirePendingApproval } =
  await import('../../routes/chat/services/threadPersistenceService.js');

const A = randomUUID();
const B = randomUUID();
const C = randomUUID();
const P = randomUUID();
const T1 = randomUUID(); // team chat of A
const T2 = randomUUID(); // private chat of A
const T3 = randomUUID(); // private chat of B
const T4 = randomUUID(); // share without write
const T5 = randomUUID(); // legacy share, permissions {}
const DOC = randomUUID();

describe.skipIf(!url)('Projektmaterial nach Mitgliedschaft', () => {
  const dbName = `projthread_${randomUUID().replace(/-/g, '')}`;
  const admin = new pg.Pool({ connectionString: url });

  beforeAll(async () => {
    await admin.query(`CREATE DATABASE ${dbName}`);
    const target = new URL(url!);
    target.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: target.toString() });
    expect(await runMigrations(pool)).toBe(true);
    await pool.query(
      `INSERT INTO profiles (id, display_name) VALUES ($1,'A'), ($2,'B'), ($3,'C')`,
      [A, B, C]
    );
    await pool.query(
      `INSERT INTO groups (id, name, created_by, is_system) VALUES ($1,'Projekt P',$2,false)`,
      [P, A]
    );
    await pool.query(
      `INSERT INTO group_memberships (group_id, user_id, role, is_active)
       VALUES ($1,$2,'admin',TRUE), ($1,$3,'member',TRUE)`,
      [P, A, B]
    );
    await pool.query(
      `INSERT INTO group_instructions (group_id, custom_prompt, instructions_enabled, is_active)
       VALUES ($1,'Im Du schreiben.',TRUE,TRUE)`,
      [P]
    );
    await pool.query(
      `INSERT INTO documents (id, user_id, title, filename, status) VALUES ($1,$2,'Förderbescheid','f.pdf','completed')`,
      [DOC, A]
    );
    await pool.query(
      `INSERT INTO group_content_shares (group_id, content_type, content_id, shared_by_user_id, permissions)
       VALUES ($1,'documents',$2,$3,'{"read":true}')`,
      [P, DOC, A]
    );
    for (const [id, owner, title] of [
      [T1, A, 'Team'],
      [T2, A, 'Privat A'],
      [T3, B, 'Privat B'],
    ] as const) {
      await pool.query(
        `INSERT INTO chat_threads (id, user_id, title, group_id) VALUES ($1,$2,$3,$4)`,
        [id, owner, title, P]
      );
    }
    await pool.query(
      `INSERT INTO group_content_shares (group_id, content_type, content_id, shared_by_user_id, permissions)
       VALUES ($1,'chat_threads',$2,$3,'{"read":true,"write":true}')`,
      [P, T1, A]
    );
  });

  afterAll(async () => {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
  });

  it('instructions: member of a team chat gets them, private chat of another does not', async () => {
    expect((await readThreadProjectInstructions(T1, B))?.text).toBe('Im Du schreiben.');
    expect(await readThreadProjectInstructions(T2, B)).toBeNull();
    expect((await readThreadProjectInstructions(T2, A))?.text).toBe('Im Du schreiben.');
    expect(await readThreadProjectInstructions(T1, C)).toBeNull();
  });

  it('files follow the same rule', async () => {
    expect(await getProjectFileDocumentIds(T1, B)).toHaveLength(1);
    expect(await getProjectFileDocumentIds(T2, B)).toHaveLength(0);
    expect(await getProjectFileDocumentIds(T1, C)).toHaveLength(0);
  });

  it('recall scope for B in the team chat: own chats plus team chats, never A private', async () => {
    const scope = await getSpaceRecallScope(T1, B);
    expect(scope).not.toBeNull();
    expect(scope!.threadIds.sort()).toEqual([T3]); // T4/T5 do not exist yet
    // T1 is the current thread (excluded); T2 is private to A.
    const own = await getSpaceRecallScope(T3, B);
    expect(own!.threadIds.sort()).toEqual([T1]);
    expect(await getSpaceRecallScope(T2, B)).toBeNull();
    expect(await getSpaceRecallScope(T1, C)).toBeNull();
  });

  it('semantic hits hydrate and deep-read for a member only for own and team chats', async () => {
    const hits = await recallPastChats(B, 'zzz-no-keyword-match', {
      threadIds: [T1, T2, T3],
      limit: 10,
    });
    expect(hits.map((h) => h.threadId).sort()).toEqual([T1, T3].sort());
    expect(await getThreadRecallContext(T1, B)).not.toBeNull();
    expect(await getThreadRecallContext(T2, B)).toBeNull();
    expect(await getThreadRecallContext(T1, C)).toBeNull();
  });

  it('a non-member with a thread permission entry gets no project material', async () => {
    await pool.query(`UPDATE chat_threads SET permissions = $2::jsonb WHERE id = $1`, [
      T1,
      JSON.stringify({ [C]: 'write' }),
    ]);
    expect(await readThreadProjectInstructions(T1, C)).toBeNull();
    expect(await getProjectFileDocumentIds(T1, C)).toHaveLength(0);
    expect(await getSpaceRecallScope(T1, C)).toBeNull();
    await pool.query(`UPDATE chat_threads SET permissions = '{}'::jsonb WHERE id = $1`, [T1]);
  });

  it('a share without write permission opens no project material', async () => {
    await pool.query(
      `INSERT INTO chat_threads (id, user_id, title, group_id) VALUES ($1,$2,'Nur lesen',$3)`,
      [T4, A, P]
    );
    await pool.query(
      `INSERT INTO group_content_shares (group_id, content_type, content_id, shared_by_user_id, permissions)
       VALUES ($1,'chat_threads',$2,$3,'{"read":true,"write":false}')`,
      [P, T4, A]
    );
    expect(await readThreadProjectInstructions(T4, B)).toBeNull();
    expect(await getProjectFileDocumentIds(T4, B)).toHaveLength(0);
  });

  it('a legacy share with empty permissions counts as read and write', async () => {
    await pool.query(
      `INSERT INTO chat_threads (id, user_id, title, group_id) VALUES ($1,$2,'Alt',$3)`,
      [T5, A, P]
    );
    await pool.query(
      `INSERT INTO group_content_shares (group_id, content_type, content_id, shared_by_user_id, permissions)
       VALUES ($1,'chat_threads',$2,$3,'{}')`,
      [P, T5, A]
    );
    expect((await readThreadProjectInstructions(T5, B))?.text).toBe('Im Du schreiben.');
    expect(await getProjectFileDocumentIds(T5, B)).toHaveLength(1);
  });

  it('a member who leaves loses the material', async () => {
    await pool.query(
      `UPDATE group_memberships SET is_active = FALSE WHERE group_id = $1 AND user_id = $2`,
      [P, B]
    );
    expect(await readThreadProjectInstructions(T1, B)).toBeNull();
    expect(await getProjectFileDocumentIds(T1, B)).toHaveLength(0);
    expect(await getSpaceRecallScope(T1, B)).toBeNull();
  });

  it('a starter who left can no longer settle cards in the team chat', async () => {
    const pending = `{"pendingApproval":{"resolved":"false"}}`;
    for (const thread of [T1, T2]) {
      await pool.query(
        `INSERT INTO chat_messages (thread_id, role, content, tool_results) VALUES ($1,'assistant','?',$2::jsonb)`,
        [thread, pending]
      );
    }
    await pool.query(
      `UPDATE group_memberships SET is_active = FALSE WHERE group_id = $1 AND user_id = $2`,
      [P, A]
    );
    await expirePendingApproval(T1, A);
    await expirePendingApproval(T2, A);
    const { rows } = await pool.query<{ thread_id: string; resolved: string }>(
      `SELECT thread_id, tool_results->'pendingApproval'->>'resolved' AS resolved
         FROM chat_messages WHERE thread_id = ANY($1::uuid[])`,
      [[T1, T2]]
    );
    expect(Object.fromEntries(rows.map((r) => [r.thread_id, r.resolved]))).toEqual({
      [T1]: 'false',
      [T2]: 'expired',
    });
  });

  it('a trashed team chat stays with the project after its starter left', async () => {
    await pool.query(`UPDATE chat_threads SET deleted_at = now() WHERE id = ANY($1::uuid[])`, [
      [T1, T2],
    ]);
    await pool.query(
      `UPDATE group_memberships SET is_active = FALSE WHERE group_id = $1 AND user_id = $2`,
      [P, A]
    );
    expect((await getTrashedThread(T1, A)).status).toBe('forbidden');
    expect((await getTrashedThread(T2, A)).status).toBe('ok');
    const listed = (await listTrashedThreads(A, { limit: 50, before: null })).map((t) => t.id);
    expect(listed).toContain(T2);
    expect(listed).not.toContain(T1);
  });
});

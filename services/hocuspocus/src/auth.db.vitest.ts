/**
 * Der Hocuspocus-Raum eines Team-Chats gegen ein echtes PostgreSQL: die Auth-
 * Tests mocken die Datenbank und sahen `content_id = $1::uuid` (TEXT = uuid →
 * Fehler, Mitglieder kamen nie in den Raum) deshalb nicht.
 *
 * Läuft nur mit `MIGRATIONS_TEST_DATABASE_URL` (CI-Job „Tests"). Das Paket kann den
 * Migrations-Runner der API nicht importieren (rootDir), darum legt der Test die
 * wenigen Tabellen selbst an (Spalten wie in schema.sql).
 */
import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuthService } from './auth.js';

const url = process.env.MIGRATIONS_TEST_DATABASE_URL;
let pool: pg.Pool;
let lastGroup = '';

const OWNER = randomUUID();
const MEMBER = randomUUID();
const STRANGER = randomUUID();
const FORMER = randomUUID();

async function profile(id: string): Promise<void> {
  await pool.query(`INSERT INTO profiles (id, email) VALUES ($1, $2)`, [
    id,
    `${id}@example.invalid`,
  ]);
}

async function teamChat(permissions: object): Promise<string> {
  const group = randomUUID();
  const thread = randomUUID();
  await pool.query(`INSERT INTO groups (id, name, group_type) VALUES ($1, 'P', 'standard')`, [
    group,
  ]);
  for (const [u, active] of [
    [OWNER, true],
    [MEMBER, true],
    [FORMER, false],
  ] as const) {
    await pool.query(
      `INSERT INTO group_memberships (group_id, user_id, is_active) VALUES ($1, $2, $3)`,
      [group, u, active]
    );
  }
  await pool.query(`INSERT INTO chat_threads (id, user_id, group_id) VALUES ($1, $2, $3)`, [
    thread,
    OWNER,
    group,
  ]);
  await pool.query(
    `INSERT INTO group_content_shares (group_id, shared_by_user_id, content_type, content_id, permissions)
     VALUES ($1, $2, 'chat_threads', $3, $4::jsonb)`,
    [group, OWNER, thread, JSON.stringify(permissions)]
  );
  lastGroup = group;
  return thread;
}

const access = (threadId: string, userId: string) => {
  const auth = new AuthService({
    db: async (sql: string, params?: unknown[]) => (await pool.query(sql, params)).rows,
    redis: { isReady: true, get: async () => null },
  }) as unknown as {
    checkChatThreadAccess(
      t: string,
      u: string
    ): Promise<{ authenticated: boolean; readOnly?: boolean }>;
  };
  return auth.checkChatThreadAccess(threadId, userId);
};

describe.skipIf(!url)('Hocuspocus chat room auth gegen Postgres', () => {
  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url });
    await pool.query(`
      CREATE TABLE profiles (id UUID PRIMARY KEY, email TEXT, display_name TEXT);
      CREATE TABLE chat_threads (
        id UUID PRIMARY KEY, user_id UUID, permissions JSONB DEFAULT '{}',
        is_public BOOLEAN DEFAULT false, doc_id UUID, group_id UUID, deleted_at TIMESTAMPTZ);
      CREATE TABLE groups (
        id UUID PRIMARY KEY, name TEXT, group_type TEXT DEFAULT 'standard',
        is_active BOOLEAN DEFAULT TRUE, deleted_at TIMESTAMPTZ);
      CREATE TABLE group_memberships (
        group_id UUID, user_id UUID, is_active BOOLEAN DEFAULT TRUE);
      CREATE TABLE group_content_shares (
        group_id UUID, shared_by_user_id UUID, content_type TEXT NOT NULL,
        content_id TEXT NOT NULL, permissions JSONB DEFAULT '{}');`);
    for (const id of [OWNER, MEMBER, STRANGER, FORMER]) await profile(id);
  });
  afterAll(async () => {
    await pool?.end();
  });

  it('a member of a write share joins the room writable', async () => {
    const t = await teamChat({ read: true, write: true });
    const res = await access(t, MEMBER);
    expect(res.authenticated).toBe(true);
    expect(res.readOnly).toBe(false);
  });

  it('a write:false share yields a read-only member', async () => {
    const t = await teamChat({ read: true, write: false });
    const res = await access(t, MEMBER);
    expect(res.authenticated).toBe(true);
    expect(res.readOnly).toBe(true);
  });

  it('a share with read:false, a stranger and a former member get nothing', async () => {
    const hidden = await teamChat({ read: false, write: true });
    expect((await access(hidden, MEMBER)).authenticated).toBe(false);
    const t = await teamChat({ read: true, write: true });
    expect((await access(t, STRANGER)).authenticated).toBe(false);
    expect((await access(t, FORMER)).authenticated).toBe(false);
  });

  it('a trashed thread has no room', async () => {
    const t = await teamChat({ read: true, write: true });
    await pool.query(`UPDATE chat_threads SET deleted_at = now() WHERE id = $1`, [t]);
    expect((await access(t, OWNER)).authenticated).toBe(false);
    expect((await access(t, MEMBER)).authenticated).toBe(false);
  });

  it('an owner who left the project loses the team chat room (#5678)', async () => {
    const t = await teamChat({ read: true, write: true });
    expect((await access(t, OWNER)).readOnly).toBe(false);
    await pool.query(
      `UPDATE group_memberships SET is_active = FALSE WHERE group_id = $1 AND user_id = $2`,
      [lastGroup, OWNER]
    );
    expect((await access(t, OWNER)).authenticated).toBe(false);
    expect((await access(t, MEMBER)).authenticated).toBe(true);
    await pool.query(`UPDATE groups SET deleted_at = now() WHERE id = $1`, [lastGroup]);
    expect((await access(t, OWNER)).readOnly).toBe(false);
  });
});

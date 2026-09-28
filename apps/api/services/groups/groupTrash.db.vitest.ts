/**
 * Projekte im Papierkorb gegen ein echtes PostgreSQL: Löschen, Unsichtbarkeit
 * für Mitglieder, Wiederherstellen samt allem, was daran hängt, und der Purge.
 *
 * Läuft nur mit `MIGRATIONS_TEST_DATABASE_URL` (CI-Job „Tests") und legt sich
 * wie `trashSchema.db.vitest.ts` eine eigene Datenbank an.
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';

import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { runMigrations } from '../../database/services/PostgresService/migrations.js';

const url = process.env.MIGRATIONS_TEST_DATABASE_URL;
let pool: pg.Pool;

type Params = unknown[] | undefined;
const rowsOf = async (runner: pg.Pool | pg.PoolClient, text: string, params: Params) =>
  (await runner.query(text, params)).rows as Record<string, unknown>[];

/** The PostgresService surface the group services use, over the test pool. */
const adapter = {
  get pool() {
    return pool;
  },
  ensureInitialized: async () => {},
  query: (text: string, params?: unknown[]) => rowsOf(pool, text, params),
  queryOne: async (text: string, params?: unknown[]) =>
    (await rowsOf(pool, text, params))[0] ?? null,
  exec: async (text: string, params?: unknown[]) => ({
    changes: (await pool.query(text, params)).rowCount ?? 0,
  }),
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
  transactionQuery: (client: pg.PoolClient, text: string, params?: unknown[]) =>
    rowsOf(client, text, params),
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
vi.mock('../../utils/adminAuthz.js', () => ({ isInstanceAdmin: async () => false }));
const notifyGroupMembers = vi.fn(async () => {});
vi.mock('../notifications/index.js', () => ({ notifyGroupMembers }));

/** Records whether the group row was already gone when a post file was removed. */
const fileDeletes: Array<{ file: string; rowGone: boolean }> = [];
vi.mock('./groupPosts.js', () => ({
  deleteGroupPostFile: async (file: string) => {
    const rows = await pool.query('SELECT 1 FROM groups WHERE id = $1', [ids.group]);
    fileDeletes.push({ file, rowGone: rows.rowCount === 0 });
  },
}));

const { getTrashedGroup, listTrashedGroups, purgeGroup, restoreGroup, trashGroup } =
  await import('./groupTrash.js');
const { getPostgresAndCheckMembership, listShareTargetGroups } =
  await import('./groupMembership.js');
const { findGroups, getGroupForMember, listUserGroups } = await import('./groupQueries.js');
const { checkGroupAccess } = await import('../../routes/docs/documentAccess.js');
const { trashHandlerFor } = await import('../trash/trashRegistry.js');

const ids = {
  creator: randomUUID(),
  admin: randomUUID(),
  member: randomUUID(),
  outsider: randomUUID(),
  group: randomUUID(),
  system: randomUUID(),
};
const DOC = 'doc-in-projekt';

async function counts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of [
    'group_memberships',
    'group_content_shares',
    'group_posts',
    'group_post_files',
    'group_instructions',
  ]) {
    const r = await pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM ${table} WHERE group_id = $1`,
      [ids.group]
    );
    out[table] = r.rows[0].n;
  }
  return out;
}

const deletedAt = async (): Promise<Date | null> =>
  (
    await pool.query<{ deleted_at: Date | null }>('SELECT deleted_at FROM groups WHERE id = $1', [
      ids.group,
    ])
  ).rows[0]?.deleted_at ?? null;

async function memberSeesGroup(): Promise<boolean> {
  const listed = (await listUserGroups(ids.member)).some((g) => g.id === ids.group);
  const found = (await findGroups(ids.member, 'Klima')).some((g) => g.id === ids.group);
  const detail = (await getGroupForMember(ids.group, ids.member)) !== null;
  const shareTarget = (await listShareTargetGroups(ids.member)).some((g) => g.id === ids.group);
  const docAccess = (await checkGroupAccess(ids.member, DOC)).hasAccess;
  const membership = await getPostgresAndCheckMembership(ids.group, ids.member).then(
    () => true,
    () => false
  );
  const all = [listed, found, detail, shareTarget, docAccess, membership];
  expect(new Set(all).size, JSON.stringify(all)).toBe(1);
  return listed;
}

describe.skipIf(!url)('Projekte im Papierkorb (groupTrash)', () => {
  const dbName = `group_trash_${randomUUID().replace(/-/g, '')}`;
  const admin = new pg.Pool({ connectionString: url });

  beforeAll(async () => {
    await admin.query(`CREATE DATABASE ${dbName}`);
    const target = new URL(url!);
    target.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: target.toString() });
    expect(await runMigrations(pool)).toBe(true);

    for (const id of [ids.creator, ids.admin, ids.member, ids.outsider]) {
      await pool.query('INSERT INTO profiles (id) VALUES ($1)', [id]);
    }
    await pool.query(
      `INSERT INTO groups (id, name, created_by, slug_suffix, avatar_url)
       VALUES ($1, 'Klima-AG', $2, 'abc123', '/api/groups/x/avatar/klima.png')`,
      [ids.group, ids.creator]
    );
    await pool.query(
      `INSERT INTO groups (id, name, created_by, is_system) VALUES ($1, 'System', $2, TRUE)
       ON CONFLICT DO NOTHING`,
      [ids.system, ids.creator]
    );
    // A migration may already have created the one system group.
    ids.system = (
      await pool.query<{ id: string }>('SELECT id FROM groups WHERE is_system')
    ).rows[0].id;
    await pool.query(
      `INSERT INTO group_memberships (group_id, user_id, role)
       VALUES ($1, $2, 'admin'), ($1, $3, 'admin'), ($1, $4, 'member')`,
      [ids.group, ids.creator, ids.admin, ids.member]
    );
    await pool.query(
      `INSERT INTO group_content_shares (group_id, shared_by_user_id, content_type, content_id, permissions)
       VALUES ($1, $2, 'collaborative_documents', $3, '{"read":true,"write":true}')`,
      [ids.group, ids.creator, DOC]
    );
    const post = await pool.query<{ id: string }>(
      `INSERT INTO group_posts (group_id, author_id, body) VALUES ($1, $2, 'Hallo') RETURNING id`,
      [ids.group, ids.creator]
    );
    await pool.query(
      `INSERT INTO group_post_files (post_id, group_id, stored_filename, file_name, mime_type, size_bytes)
       VALUES ($1, $2, 'stored-1.pdf', 'Antrag.pdf', 'application/pdf', 10)`,
      [post.rows[0].id, ids.group]
    );
    await pool.query(`INSERT INTO group_instructions (group_id) VALUES ($1)`, [ids.group]);
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
  });

  beforeEach(() => {
    notifyGroupMembers.mockClear();
    fileDeletes.length = 0;
  });

  it('refuses a plain member, an outsider and the system group', async () => {
    expect(await trashGroup(ids.group, ids.member)).toBe('forbidden');
    expect(await trashGroup(ids.group, ids.outsider)).toBe('forbidden');
    expect(await trashGroup(ids.system, ids.creator)).toBe('system');
    expect(await trashHandlerFor('group').trash(ids.creator, ids.system)).toBe('forbidden');
    expect(await trashGroup('not-a-uuid', ids.creator)).toBe('not_found');
    expect(await deletedAt()).toBeNull();
    expect(notifyGroupMembers).not.toHaveBeenCalled();
  });

  it('trashes: the members lose the Projekt everywhere, nothing hanging off it is deleted', async () => {
    const before = await counts();
    expect(await memberSeesGroup()).toBe(true);

    expect(await trashGroup(ids.group, ids.creator)).toBe('ok');

    expect(await deletedAt()).toBeInstanceOf(Date);
    expect(notifyGroupMembers).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: ids.group, type: 'group_deleted' })
    );
    expect(await memberSeesGroup()).toBe(false);
    expect(await counts()).toEqual(before);
    expect(await trashGroup(ids.group, ids.creator)).toBe('not_found');
  });

  it('lists and resolves the trashed Projekt for creator and admin members only', async () => {
    for (const user of [ids.creator, ids.admin]) {
      const listed = await listTrashedGroups(user, { limit: 10, before: null });
      expect(listed.map((g) => g.id)).toEqual([ids.group]);
      expect(await getTrashedGroup(user, ids.group)).toMatchObject({ name: 'Klima-AG' });
    }
    expect(await listTrashedGroups(ids.member, { limit: 10, before: null })).toEqual([]);
    expect(await getTrashedGroup(ids.member, ids.group)).toBe('forbidden');
    expect(await restoreGroup(ids.member, ids.group)).toBe('forbidden');
    expect(await purgeGroup(ids.group, new Date(0))).toBe(false);

    const [item] = await trashHandlerFor('group').listTrashed(ids.admin, {
      limit: 10,
      before: null,
    });
    expect(item).toMatchObject({ kind: 'group', id: ids.group, title: 'Klima-AG' });
  });

  it('restores completely: memberships, posts, shares and instructions come back', async () => {
    const before = await counts();
    expect(await restoreGroup(ids.admin, ids.group)).toBe('ok');
    expect(await deletedAt()).toBeNull();
    expect(await counts()).toEqual(before);
    expect(before).toEqual({
      group_memberships: 3,
      group_content_shares: 1,
      group_posts: 1,
      group_post_files: 1,
      group_instructions: 1,
    });
    expect(await memberSeesGroup()).toBe(true);
    expect(await restoreGroup(ids.admin, ids.group)).toBe('not_found');
  });

  it('purges only a trashed row, then its files and avatar', async () => {
    const unlink = vi.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined);
    try {
      expect(await purgeGroup(ids.group, null)).toBe(false);
      expect(fileDeletes).toEqual([]);

      expect(await trashGroup(ids.group, ids.admin)).toBe('ok');
      expect(await purgeGroup(ids.group, new Date(Date.now() - 60_000))).toBe(false);
      expect(await deletedAt()).toBeInstanceOf(Date);
      expect(fileDeletes).toEqual([]);
      expect(unlink).not.toHaveBeenCalled();

      expect(await purgeGroup(ids.group, null)).toBe(true);
      expect(await deletedAt()).toBeNull();
      expect(await counts()).toEqual({
        group_memberships: 0,
        group_content_shares: 0,
        group_posts: 0,
        group_post_files: 0,
        group_instructions: 0,
      });
      expect(fileDeletes).toEqual([{ file: 'stored-1.pdf', rowGone: true }]);
      expect(unlink).toHaveBeenCalledWith(expect.stringMatching(/group-avatars\/klima\.png$/));

      expect(await purgeGroup(ids.group, null)).toBe(false);
      expect(fileDeletes).toHaveLength(1);
    } finally {
      unlink.mockRestore();
    }
  });
});

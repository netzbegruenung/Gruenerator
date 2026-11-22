/**
 * `create` with `teamShared: true`: thread and group share (read + write) are
 * written in ONE transaction, only in team projects, only for active members.
 * Läuft nur mit `MIGRATIONS_TEST_DATABASE_URL` (CI-Job „Tests").
 */
import { randomUUID } from 'node:crypto';

import { threadSchema } from '@gruenerator/contracts';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { runMigrations } from '../../database/services/PostgresService/migrations.js';

import type { Request } from 'express';

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
  transaction: async <T>(cb: (client: pg.PoolClient) => Promise<T>): Promise<T> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await cb(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },
};

vi.mock('../../database/services/PostgresService/PostgresService.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getPostgresInstance: () => adapter,
}));
vi.mock('../../database/services/PostgresService.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getPostgresInstance: () => adapter,
}));
vi.mock('../../services/groups/groupContent.js', () => ({ notifyContentShared: vi.fn() }));
vi.mock('../../services/collab/collabRooms.js', () => ({ closeShareRoom: vi.fn(async () => {}) }));
vi.mock('../../services/chat/threadRecallEmbeddingService.js', () => ({}));
vi.mock('../../services/chat/threadTitleService.js', () => ({}));
vi.mock('./services/attachmentPersistenceService.js', () => ({}));

const { threadsContractRouter } = await import('./threadsContractRouter.js');

const ada = randomUUID();
const bea = randomUUID();
const outsider = randomUUID();
const teamProject = randomUUID();
const personalProject = randomUUID();

const asUser = (id: string) =>
  ({ user: { id }, headers: {}, originalUrl: '/x' }) as unknown as Request;
const create = (userId: string, body: Record<string, unknown>) =>
  (
    threadsContractRouter.create as unknown as (a: {
      req: Request;
      body: unknown;
    }) => Promise<{ status: number; body: Record<string, unknown> }>
  )({ req: asUser(userId), body });
const list = async (userId: string) =>
  (
    await (
      threadsContractRouter.list as unknown as (a: {
        req: Request;
        query: object;
      }) => Promise<{ status: number; body: Array<Record<string, unknown>> }>
    )({ req: asUser(userId), query: {} })
  ).body;
const sharesOf = async (threadId: string) =>
  (
    await pool.query(
      `SELECT group_id, permissions FROM group_content_shares
        WHERE content_type = 'chat_threads' AND content_id = $1`,
      [threadId]
    )
  ).rows;

describe.skipIf(!url)('threads create — team chat', () => {
  const dbName = `teamchat_${randomUUID().replace(/-/g, '')}`;
  const admin = new pg.Pool({ connectionString: url });

  beforeAll(async () => {
    await admin.query(`CREATE DATABASE ${dbName}`);
    const target = new URL(url!);
    target.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: target.toString() });
    expect(await runMigrations(pool)).toBe(true);
    await pool.query(
      'INSERT INTO profiles (id, display_name) VALUES ($1, $2), ($3, $4), ($5, $6)',
      [ada, 'Ada', bea, 'Bea', outsider, 'Otto']
    );
    await pool.query(
      `INSERT INTO groups (id, name, created_by, is_system, group_type)
       VALUES ($1, 'KV Team', $2, false, 'standard'), ($3, 'Persönlich', $2, false, 'personal')`,
      [teamProject, ada, personalProject]
    );
    await pool.query(
      `INSERT INTO group_memberships (group_id, user_id, role, is_active)
       VALUES ($1, $2, 'admin', TRUE), ($1, $3, 'member', TRUE), ($4, $2, 'admin', TRUE)`,
      [teamProject, ada, bea, personalProject]
    );
  });

  afterAll(async () => {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
  });

  it('writes the thread and a read+write group share together', async () => {
    const res = await create(ada, { groupId: teamProject, teamShared: true });
    expect(res.status).toBe(201);
    const shares = await sharesOf(res.body.id as string);
    expect(shares).toHaveLength(1);
    expect(shares[0]).toMatchObject({
      group_id: teamProject,
      permissions: { read: true, write: true },
    });
  });

  it('rolls the thread back when the share cannot be written', async () => {
    const before = (await pool.query('SELECT count(*)::int AS n FROM chat_threads')).rows[0].n;
    await pool.query(
      `ALTER TABLE group_content_shares ADD CONSTRAINT tc_block CHECK (false) NOT VALID`
    );
    try {
      const res = await create(ada, { groupId: teamProject, teamShared: true });
      expect(res.status).toBe(500);
    } finally {
      await pool.query('ALTER TABLE group_content_shares DROP CONSTRAINT tc_block');
    }
    const after = (await pool.query('SELECT count(*)::int AS n FROM chat_threads')).rows[0].n;
    expect(after).toBe(before);
  });

  it('allows a team chat in a project stored as personal (type does not matter)', async () => {
    const res = await create(ada, { groupId: personalProject, teamShared: true });
    expect(res.status).toBe(201);
    expect(await sharesOf(res.body.id as string)).toHaveLength(1);
  });

  it('refuses teamShared without a project', async () => {
    const res = await create(ada, { teamShared: true });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'team_chat_needs_team_project' });
  });

  it('answers 403 to a non-member', async () => {
    const res = await create(outsider, { groupId: teamProject, teamShared: true });
    expect(res.status).toBe(403);
  });

  it('writes no share without teamShared (private project chat as today)', async () => {
    const res = await create(ada, { groupId: teamProject });
    expect(res.status).toBe(201);
    expect(await sharesOf(res.body.id as string)).toHaveLength(0);
  });

  it('lists ownerName and teamShared, for the owner and for a team member', async () => {
    const team = await create(ada, { groupId: teamProject, teamShared: true });
    const priv = await create(ada, { groupId: teamProject });

    const forBea = await list(bea);
    const t = forBea.find((r) => r.id === team.body.id);
    expect(t).toMatchObject({ ownerName: 'Ada', teamShared: true, accessType: 'group' });
    expect(forBea.find((r) => r.id === priv.body.id)).toBeUndefined();
    expect(() => threadSchema.parse(t)).not.toThrow();

    const forAda = await list(ada);
    expect(forAda.find((r) => r.id === priv.body.id)).toMatchObject({
      ownerName: 'Ada',
      teamShared: false,
    });
  });

  it('lists shared: false for a private chat, true for every kind of sharing', async () => {
    const priv = (await create(ada, {})).body.id as string;
    const person = (await create(ada, {})).body.id as string;
    const link = (await create(ada, {})).body.id as string;
    const pub = (await create(ada, {})).body.id as string;
    const otherGroup = (await create(ada, {})).body.id as string;
    await pool.query(`UPDATE chat_threads SET permissions = $2::jsonb WHERE id = $1`, [
      person,
      JSON.stringify({ [bea]: { read: true, write: true } }),
    ]);
    await pool.query(`UPDATE chat_threads SET share_mode = 'authenticated' WHERE id = $1`, [link]);
    await pool.query(`UPDATE chat_threads SET is_public = true WHERE id = $1`, [pub]);
    await pool.query(
      `INSERT INTO group_content_shares (group_id, shared_by_user_id, content_type, content_id, permissions)
       VALUES ($1, $2, 'chat_threads', $3, '{"read":true,"write":false}'::jsonb)`,
      [teamProject, ada, otherGroup]
    );
    const rows = await list(ada);
    const shared = (id: string) => rows.find((r) => r.id === id)?.shared;
    expect(shared(priv)).toBe(false);
    for (const id of [person, link, pub, otherGroup]) expect(shared(id)).toBe(true);
    expect(() => threadSchema.parse(rows.find((r) => r.id === priv))).not.toThrow();
  });

  it('reports teamShared false once the project is trashed or inactive', async () => {
    const team = await create(ada, { groupId: teamProject, teamShared: true });
    const id = team.body.id as string;
    try {
      await pool.query('UPDATE groups SET is_active = FALSE WHERE id = $1', [teamProject]);
      expect((await list(ada)).find((r) => r.id === id)).toMatchObject({ teamShared: false });
      await pool.query('UPDATE groups SET is_active = TRUE, deleted_at = NOW() WHERE id = $1', [
        teamProject,
      ]);
      expect((await list(ada)).find((r) => r.id === id)).toMatchObject({
        groupId: null,
        teamShared: false,
      });
    } finally {
      await pool.query('UPDATE groups SET is_active = TRUE, deleted_at = NULL WHERE id = $1', [
        teamProject,
      ]);
    }
  });
});

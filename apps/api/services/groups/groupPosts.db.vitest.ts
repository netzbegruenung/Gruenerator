/**
 * Beiträge gegen ein echtes Postgres: `group_content_shares.content_id` ist TEXT,
 * `group_posts.id` UUID. Die Unit-Tests mocken die Datenbank und sahen deshalb nie,
 * dass `getPost` an `text = uuid` scheiterte — Bearbeiten und Löschen antworteten 500.
 *
 * Läuft nur mit `MIGRATIONS_TEST_DATABASE_URL` (CI-Job „Tests").
 */
import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runMigrations } from '../../database/services/PostgresService/migrations.js';

import {
  createGroupPost,
  deleteGroupPost,
  updateGroupPost,
  type GroupPostDeps,
} from './groupPosts.js';

const url = process.env.MIGRATIONS_TEST_DATABASE_URL;
let pool: pg.Pool;

type Client = pg.PoolClient;
const rows = async (q: pg.Pool | Client, text: string, params?: unknown[]) =>
  (await q.query<Record<string, unknown>>(text, params)).rows;

const deps = (): GroupPostDeps => ({
  postgres: {
    query: (text: string, params?: unknown[]) => rows(pool, text, params),
    queryOne: async (text: string, params?: unknown[]) =>
      (await rows(pool, text, params))[0] ?? null,
    exec: async (text: string, params?: unknown[]) => {
      const r = await pool.query(text, params);
      return { changes: r.rowCount ?? 0 };
    },
    transaction: async <T>(fn: (client: Client) => Promise<T>) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const out = await fn(client);
        await client.query('COMMIT');
        return out;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    transactionQueryOne: async (client: Client, text: string, params?: unknown[]) =>
      (await rows(client, text, params))[0] ?? null,
    transactionExec: async (client: Client, text: string, params?: unknown[]) => {
      const r = await client.query(text, params);
      return { changes: r.rowCount ?? 0 };
    },
  } as unknown as GroupPostDeps['postgres'],
  notify: async () => {},
  deleteFile: async () => {},
  isInstanceAdmin: async () => false,
});

const A = randomUUID();
const G = randomUUID();

describe.skipIf(!url)('Beiträge gegen echtes Postgres', () => {
  const dbName = `groupposts_${randomUUID().replace(/-/g, '')}`;
  const admin = new pg.Pool({ connectionString: url });

  beforeAll(async () => {
    await admin.query(`CREATE DATABASE ${dbName}`);
    const target = new URL(url!);
    target.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: target.toString() });
    expect(await runMigrations(pool)).toBe(true);
    await pool.query(`INSERT INTO profiles (id, display_name) VALUES ($1,'A')`, [A]);
    await pool.query(
      `INSERT INTO groups (id, name, created_by, is_system) VALUES ($1,'Projekt',$2,false)`,
      [G, A]
    );
    await pool.query(
      `INSERT INTO group_memberships (group_id, user_id, role, is_active) VALUES ($1,$2,'admin',TRUE)`,
      [G, A]
    );
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin.end();
  });

  it('bearbeitet und löscht einen Beitrag samt Share-Zeile', async () => {
    const created = await createGroupPost(
      { groupId: G, userId: A, authorName: 'A', body: 'Erster Text', files: [] },
      deps()
    );
    expect(created.status).toBe(201);
    if (created.status !== 201) return;
    const { postId } = created.data;

    const updated = await updateGroupPost(
      { groupId: G, postId, userId: A, authorName: 'A', body: 'Neuer Text' },
      deps()
    );
    expect(updated).toEqual({ status: 200, data: null });

    const deleted = await deleteGroupPost({ groupId: G, postId, userId: A }, deps());
    expect(deleted).toEqual({ status: 200, data: null });
    expect(await rows(pool, 'SELECT 1 FROM group_posts WHERE id = $1', [postId])).toHaveLength(0);
    expect(
      await rows(pool, 'SELECT 1 FROM group_content_shares WHERE content_id = $1', [postId])
    ).toHaveLength(0);
  });
});

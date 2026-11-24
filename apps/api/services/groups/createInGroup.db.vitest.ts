/**
 * „Neu im Projekt anlegen“ gegen ein echtes PostgreSQL: Dokument und Freigabe
 * entstehen zusammen, und wer im Projekt nicht teilen darf, hinterlässt kein
 * loses Dokument.
 *
 * Läuft nur mit `MIGRATIONS_TEST_DATABASE_URL` (CI-Job „Tests").
 */
import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { runMigrations } from '../../database/services/PostgresService/migrations.js';

import type { TxQuery } from './createInGroup.js';

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
  transaction: async <T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T> => {
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
};

vi.mock('../../database/services/PostgresService/PostgresService.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getPostgresInstance: () => adapter,
}));

const { createInGroup, shareCreatedIntoTeamChatProject } = await import('./createInGroup.js');
const { GroupShareForbiddenError } = await import('./groupShareWriter.js');

const owner = randomUUID();
const outsider = randomUUID();
const group = randomUUID();
const foreignGroup = randomUUID();

const insertDoc = (title: string) => async (query: TxQuery) =>
  (
    await query(
      `INSERT INTO collaborative_documents (title, created_by, last_edited_by, document_subtype, is_public)
       VALUES ($1, $2, $2, 'docs', false) RETURNING id`,
      [title, owner]
    )
  )[0] as { id: string };

describe.skipIf(!url)('createInGroup gegen Postgres', () => {
  const dbName = `createingroup_${randomUUID().replace(/-/g, '')}`;
  const admin = new pg.Pool({ connectionString: url });

  beforeAll(async () => {
    await admin.query(`CREATE DATABASE ${dbName}`);
    const target = new URL(url!);
    target.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: target.toString() });
    expect(await runMigrations(pool)).toBe(true);
    await pool.query('INSERT INTO profiles (id, display_name) VALUES ($1, $2), ($3, $4)', [
      owner,
      'Ada',
      outsider,
      'Bea',
    ]);
    await pool.query(
      `INSERT INTO groups (id, name, created_by, is_system)
       VALUES ($1, 'KV Teststadt', $2, false), ($3, 'OV Fremd', $4, false)`,
      [group, owner, foreignGroup, outsider]
    );
    await pool.query(
      `INSERT INTO group_memberships (group_id, user_id, role, is_active)
       VALUES ($1, $2, 'member', TRUE), ($3, $4, 'admin', TRUE)`,
      [group, owner, foreignGroup, outsider]
    );
  });

  afterAll(async () => {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
  });

  it('creates the document and a writable share in one go', async () => {
    const { id } = await createInGroup({ userId: owner, groupId: group, insert: insertDoc('A') });
    const shares = await pool.query(
      `SELECT group_id, shared_by_user_id, permissions FROM group_content_shares
        WHERE content_type = 'collaborative_documents' AND content_id = $1`,
      [id]
    );
    expect(shares.rows).toEqual([
      {
        group_id: group,
        shared_by_user_id: owner,
        permissions: { read: true, write: true, collaborative: false },
      },
    ]);
  });

  describe('shareCreatedIntoTeamChatProject', () => {
    const thread = async (shareIntoGroup: boolean, groupId = group): Promise<string> => {
      const t = await pool.query<{ id: string }>(
        `INSERT INTO chat_threads (user_id, group_id, title) VALUES ($1, $2, 'Chat') RETURNING id`,
        [owner, groupId]
      );
      const id = t.rows[0].id;
      if (shareIntoGroup) {
        await pool.query(
          `INSERT INTO group_content_shares (content_type, content_id, group_id, shared_by_user_id, permissions)
           VALUES ('chat_threads', $1, $2, $3, '{"read": true, "write": true}')`,
          [id, groupId, owner]
        );
      }
      return id;
    };
    const doc = async (title: string): Promise<string> =>
      (
        await pool.query<{ id: string }>(
          `INSERT INTO collaborative_documents (title, created_by, last_edited_by, document_subtype, is_public)
           VALUES ($1, $2, $2, 'boards', false) RETURNING id`,
          [title, owner]
        )
      ).rows[0].id;
    const sharesOf = async (id: string) =>
      (
        await pool.query(
          `SELECT group_id, permissions FROM group_content_shares
            WHERE content_type = 'collaborative_documents' AND content_id = $1`,
          [id]
        )
      ).rows;

    it('teilt, was im Team-Chat entsteht, mit Schreibrecht ins Projekt', async () => {
      const id = await doc('Team-Board');
      const threadId = await thread(true);
      expect(
        await shareCreatedIntoTeamChatProject({ threadId, userId: owner, documentId: id })
      ).toBe(group);
      expect(await sharesOf(id)).toEqual([
        { group_id: group, permissions: { read: true, write: true, collaborative: false } },
      ]);
    });

    it('lässt privat, was in einem privaten Chat im Projekt entsteht', async () => {
      const id = await doc('Privat-Board');
      const threadId = await thread(false);
      expect(
        await shareCreatedIntoTeamChatProject({ threadId, userId: owner, documentId: id })
      ).toBe(null);
      expect(await sharesOf(id)).toEqual([]);
    });

    it('ein archiviertes Projekt nimmt nichts Neues an', async () => {
      const archived = randomUUID();
      await pool.query(
        `INSERT INTO groups (id, name, created_by, is_system, archived_at)
         VALUES ($1, 'Archiv', $2, false, NOW())`,
        [archived, owner]
      );
      await pool.query(
        `INSERT INTO group_memberships (group_id, user_id, role, is_active) VALUES ($1, $2, 'admin', TRUE)`,
        [archived, owner]
      );
      const id = await doc('Archiv-Board');
      const threadId = await thread(true, archived);
      expect(
        await shareCreatedIntoTeamChatProject({ threadId, userId: owner, documentId: id })
      ).toBe(null);
      expect(await sharesOf(id)).toEqual([]);
    });
  });

  it('leaves no document behind in a project the person is not in', async () => {
    await expect(
      createInGroup({ userId: owner, groupId: foreignGroup, insert: insertDoc('Verwaist') })
    ).rejects.toBeInstanceOf(GroupShareForbiddenError);
    const docs = await pool.query(`SELECT 1 FROM collaborative_documents WHERE title = 'Verwaist'`);
    expect(docs.rows).toHaveLength(0);
  });
});

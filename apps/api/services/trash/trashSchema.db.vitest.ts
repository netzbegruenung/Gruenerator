/**
 * The Papierkorb migration against a real PostgreSQL, built from zero.
 *
 * Runs only with `MIGRATIONS_TEST_DATABASE_URL` (the CI job „Tests"). It must
 * not share that database with `migrations.db.vitest.ts`, which asserts it
 * starts EMPTY and runs in parallel — so this file creates its own database
 * next to it (the CI role has CREATEDB for that), migrates it and drops it.
 */
import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { TRASHABLE_TABLES } from '../../database/trash.js';
import { runMigrations } from '../../database/services/PostgresService/migrations.js';
import {
  listTrashedCollaborativeDocuments,
  purgeCollaborativeDocument,
  restoreCollaborativeDocument,
  trashCollaborativeDocument,
  type QueryRunner,
} from '../docs/CollaborativeDocumentService.js';

// Only the scheduler's SQL constant is used; its module-level pool is never touched.
// The global instance has no `query`: a purge statement escaping `run` fails here.
vi.mock('../../database/services/PostgresService/PostgresService.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getPostgresInstance: () => ({}),
}));
const { DUE_SCHEDULES_SQL } = await import('../boards/boardScheduleService.js');

const url = process.env.MIGRATIONS_TEST_DATABASE_URL;

describe.skipIf(!url)('Papierkorb schema (zz_20260929_trash_deleted_at.sql)', () => {
  const dbName = `trash_schema_${randomUUID().replace(/-/g, '')}`;
  const admin = new pg.Pool({ connectionString: url });
  let pool: pg.Pool;
  const run: QueryRunner = async <T>(sql: string, params?: unknown[]) =>
    (await pool.query(sql, params)).rows as T[];

  beforeAll(async () => {
    await admin.query(`CREATE DATABASE ${dbName}`);
    const target = new URL(url!);
    target.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: target.toString() });
    expect(await runMigrations(pool)).toBe(true);
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
  });

  it('adds a nullable timestamptz deleted_at and a partial index to every trash table', async () => {
    for (const table of Object.keys(TRASHABLE_TABLES)) {
      const column = await pool.query<{ data_type: string; is_nullable: string }>(
        `SELECT data_type, is_nullable FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'deleted_at'`,
        [table]
      );
      expect(column.rows, table).toEqual([
        { data_type: 'timestamp with time zone', is_nullable: 'YES' },
      ]);

      const index = await pool.query<{ indexdef: string }>(
        `SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1`,
        [`idx_${table}_trashed`]
      );
      expect(index.rows[0]?.indexdef, table).toContain('WHERE (deleted_at IS NOT NULL)');
    }
  });

  it('rejects is_deleted without deleted_at (23514)', async () => {
    await expect(
      pool.query(
        `INSERT INTO collaborative_documents (title, is_deleted, deleted_at) VALUES ('x', true, NULL)`
      )
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query(
        `INSERT INTO collaborative_documents (title, is_deleted, deleted_at) VALUES ('x', false, now())`
      )
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('runs the collaborative_documents lifecycle against the real constraint', async () => {
    const owner = randomUUID();
    await pool.query('INSERT INTO profiles (id) VALUES ($1)', [owner]);
    const {
      rows: [doc],
    } = await pool.query<{ id: string }>(
      `INSERT INTO collaborative_documents (title, created_by, document_subtype)
       VALUES ('Antrag', $1, 'docs') RETURNING id`,
      [owner]
    );
    await pool.query(
      `INSERT INTO yjs_document_updates (document_id, update_data) VALUES ($1, '\\x00')`,
      [doc.id]
    );
    await pool.query('INSERT INTO chat_threads (user_id, doc_id) VALUES ($1, $2)', [owner, doc.id]);
    await pool.query(
      `INSERT INTO board_scheduled_runs (board_id, card_id, created_by, flow_config, rrule, next_run_at)
       VALUES ($1, 'c1', $2, '{}', 'FREQ=DAILY', now() - interval '1 minute')`,
      [doc.id, owner]
    );
    const dueForDoc = async () =>
      (await pool.query<{ board_id: string }>(DUE_SCHEDULES_SQL)).rows.filter(
        (r) => r.board_id === doc.id
      ).length;
    expect(await dueForDoc()).toBe(1);
    const state = async () =>
      (
        await pool.query<{ is_deleted: boolean; deleted_at: Date | null }>(
          'SELECT is_deleted, deleted_at FROM collaborative_documents WHERE id = $1',
          [doc.id]
        )
      ).rows[0];

    expect(await trashCollaborativeDocument(run, doc.id, owner, null)).toEqual({ status: 'ok' });
    expect(await state()).toMatchObject({ is_deleted: true, deleted_at: expect.any(Date) });
    // A trashed board stops firing its schedules.
    expect(await dueForDoc()).toBe(0);
    const listed = await listTrashedCollaborativeDocuments(run, owner, { limit: 10, before: null });
    expect(listed.map((r) => r.id)).toEqual([doc.id]);

    expect((await restoreCollaborativeDocument(run, doc.id, owner)).status).toBe('ok');
    expect(await state()).toEqual({ is_deleted: false, deleted_at: null });

    // A live row is never purged, whatever the cutoff.
    expect(await purgeCollaborativeDocument(run, doc.id, null)).toBe(false);
    expect(await state()).toBeDefined();

    await trashCollaborativeDocument(run, doc.id, owner, null);
    // Not yet expired for a cutoff in the past.
    expect(await purgeCollaborativeDocument(run, doc.id, new Date(Date.now() - 86_400_000))).toBe(
      false
    );
    expect(await purgeCollaborativeDocument(run, doc.id, null)).toBe(true);
    expect(await state()).toBeUndefined();
    const yjs = await pool.query('SELECT 1 FROM yjs_document_updates WHERE document_id = $1', [
      doc.id,
    ]);
    expect(yjs.rowCount).toBe(0);
    const thread = await pool.query('SELECT 1 FROM chat_threads WHERE doc_id = $1', [doc.id]);
    expect(thread.rowCount).toBe(0);
    const schedules = await pool.query('SELECT 1 FROM board_scheduled_runs WHERE board_id = $1', [
      doc.id,
    ]);
    expect(schedules.rowCount).toBe(0);
  });

  it('keeps unique keys among live rows only (zz_20260929b_trash_partial_unique.sql)', async () => {
    const owner = randomUUID();
    await pool.query('INSERT INTO profiles (id) VALUES ($1)', [owner]);
    const label = 'Kreisverband';
    const insert = () =>
      pool.query<{ id: string }>(
        `INSERT INTO user_letterheads (user_id, label) VALUES ($1, $2) RETURNING id`,
        [owner, label]
      );

    const {
      rows: [old],
    } = await insert();
    await expect(insert()).rejects.toMatchObject({ code: '23505' });

    await pool.query('UPDATE user_letterheads SET deleted_at = now() WHERE id = $1', [old.id]);
    // A trashed row does not block its label.
    await insert();
    // Restoring it next to the new one is the conflict the Papierkorb answers with 409.
    await expect(
      pool.query('UPDATE user_letterheads SET deleted_at = NULL WHERE id = $1', [old.id])
    ).rejects.toMatchObject({ code: '23505' });

    const partial = await pool.query<{ indexname: string; indexdef: string }>(
      `SELECT indexname, indexdef FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = ANY($1)`,
      [
        [
          'user_agents_user_identifier_unique',
          'user_text_forms_user_mention_unique',
          'user_letterheads_user_label_unique',
          'user_sites_subdomain_unique',
          'custom_prompts_slug_unique',
          'custom_prompts_user_slug_unique',
        ],
      ]
    );
    expect(partial.rows).toHaveLength(6);
    for (const row of partial.rows) {
      expect(row.indexdef, row.indexname).toContain('UNIQUE');
      expect(row.indexdef, row.indexname).toContain('WHERE (deleted_at IS NULL)');
    }
    // No full unique constraint is left on those keys.
    const full = await pool.query(
      `SELECT conname FROM pg_constraint
        WHERE contype = 'u'
          AND conrelid::regclass::text IN ('user_agents', 'user_text_forms', 'user_sites', 'custom_prompts')`
    );
    expect(full.rows).toEqual([]);
  });
});

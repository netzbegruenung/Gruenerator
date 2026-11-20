/**
 * Das Projektrecht an einem Dokument gegen ein echtes PostgreSQL: liegt es in zwei
 * Projekten der Person (einmal lesen, einmal schreiben), gilt das stärkere Recht —
 * egal, in welcher Reihenfolge die Zeilen kommen. Vorher entschied `LIMIT 1`.
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
  ensureInitialized: async () => {},
  query: async (text: string, params?: unknown[]): Promise<unknown[]> =>
    (await pool.query<Record<string, unknown>>(text, params)).rows,
};

vi.mock('../../database/services/PostgresService/PostgresService.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getPostgresInstance: () => adapter,
}));

const { checkDocumentWriteAccess, checkDocumentAccess } = await import('./documentAccess.js');

const owner = randomUUID();
const member = randomUUID();
const readGroup = randomUUID();
const writeGroup = randomUUID();

async function newDoc(): Promise<string> {
  const rows = await pool.query<{ id: string }>(
    `INSERT INTO collaborative_documents (title, created_by, last_edited_by, document_subtype, is_public)
     VALUES ('Antrag', $1, $1, 'docs', false) RETURNING id`,
    [owner]
  );
  return rows.rows[0]!.id;
}

async function share(docId: string, groupId: string, write: boolean): Promise<void> {
  await pool.query(
    `INSERT INTO group_content_shares (content_type, content_id, group_id, shared_by_user_id, permissions)
     VALUES ('collaborative_documents', $1, $2, $3, $4)`,
    [docId, groupId, owner, JSON.stringify({ read: true, write })]
  );
}

describe.skipIf(!url)('documentAccess gegen Postgres', () => {
  const dbName = `docaccess_${randomUUID().replace(/-/g, '')}`;
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
      member,
      'Bea',
    ]);
    await pool.query(
      `INSERT INTO groups (id, name, created_by) VALUES ($1, 'Lesen', $3), ($2, 'Schreiben', $3)`,
      [readGroup, writeGroup, owner]
    );
    await pool.query(
      `INSERT INTO group_memberships (group_id, user_id, role, is_active)
       VALUES ($1, $3, 'member', TRUE), ($2, $3, 'member', TRUE)`,
      [readGroup, writeGroup, member]
    );
  });

  afterAll(async () => {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
  });

  it('gives write when one of two projects grants it, in either insert order', async () => {
    const a = await newDoc();
    await share(a, readGroup, false);
    await share(a, writeGroup, true);
    const b = await newDoc();
    await share(b, writeGroup, true);
    await share(b, readGroup, false);
    expect(await checkDocumentWriteAccess(a, member)).toBe(true);
    expect(await checkDocumentWriteAccess(b, member)).toBe(true);
  });

  it('stays read-only when every project only grants reading', async () => {
    const d = await newDoc();
    await share(d, readGroup, false);
    expect(await checkDocumentWriteAccess(d, member)).toBe(false);
    expect(
      (
        await checkDocumentAccess(
          { id: d, created_by: owner, permissions: {}, is_public: false },
          member
        )
      ).hasAccess
    ).toBe(true);
  });

  it('grants nothing without a share', async () => {
    const d = await newDoc();
    expect(await checkDocumentWriteAccess(d, member)).toBe(false);
    expect(
      (
        await checkDocumentAccess(
          { id: d, created_by: owner, permissions: {}, is_public: false },
          member
        )
      ).hasAccess
    ).toBe(false);
  });
});

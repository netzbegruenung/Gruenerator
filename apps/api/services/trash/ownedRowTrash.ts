/**
 * The Papierkorb steps every owner-bound table shares: a row belongs to
 * `user_id`, is keyed by a uuid `id`, and only its owner may delete it — so
 * only its owner may restore or purge it too (same predicate).
 *
 * Each kind's service keeps its own `trash*` (the DELETE handler's new body)
 * and `purge*` (the old hard delete plus its side stores); what is identical
 * across the tables — look up, restore, list, list expired, the conditional
 * DELETE — lives here once.
 *
 * `table` and `columns` are SQL spliced into the statements: callers pass
 * constants, never input.
 */
import { type TrashKind } from '@gruenerator/contracts';
import { sql } from 'drizzle-orm';

import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { reportBackgroundError } from '../../utils/reportBackgroundError.js';

import { type TrashCursor, trashKeysetWhere, trashOrderBy } from './trashCursor.js';

export interface OwnedTrashTable {
  table: string;
  /** Select list of a Papierkorb row: `id` plus whatever `title` needs. */
  columns: string;
}

export type OwnedTrashResult = 'ok' | 'not_found' | 'forbidden';
export type OwnedRestoreResult = OwnedTrashResult | 'conflict';

export type Trashed<Row> = Row & { id: string; deleted_at: Date };
export type OwnedTrashLookup<Row> = Trashed<Row> | Exclude<OwnedTrashResult, 'ok'>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A non-uuid id names no row; casting it would make Postgres throw. */
export function isRowId(id: string): boolean {
  return UUID_RE.test(id);
}

/**
 * Postgres unique violation. `PostgresService.query` rethrows a plain Error
 * without the code, Drizzle wraps the pg error in `cause` — look at both.
 */
export function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: unknown; cause?: { code?: unknown } } | null;
  return e?.code === '23505' || e?.cause?.code === '23505';
}

/** Set `deleted_at` on a live row the user owns. */
export async function trashOwnedRow(
  t: OwnedTrashTable,
  userId: string,
  id: string
): Promise<OwnedTrashResult> {
  if (!isRowId(id)) return 'not_found';
  const db = getPostgresInstance();
  const rows = await db.query<{ user_id: string | null }>(
    `SELECT user_id FROM ${t.table} WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  if (rows.length === 0) return 'not_found';
  if (rows[0].user_id !== userId) return 'forbidden';
  await db.query(`UPDATE ${t.table} SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`, [
    id,
  ]);
  return 'ok';
}

/** A trashed row the user may restore or purge. */
export async function getTrashedOwnedRow<Row>(
  t: OwnedTrashTable,
  userId: string,
  id: string
): Promise<OwnedTrashLookup<Row>> {
  if (!isRowId(id)) return 'not_found';
  const rows = await getPostgresInstance().query<Trashed<Row> & { user_id: string | null }>(
    `SELECT ${t.columns}, deleted_at, user_id FROM ${t.table}
     WHERE id = $1 AND deleted_at IS NOT NULL`,
    [id]
  );
  if (rows.length === 0) return 'not_found';
  const { user_id, ...row } = rows[0];
  return user_id === userId ? (row as Trashed<Row>) : 'forbidden';
}

/**
 * Clear `deleted_at`. A unique key the row shares with a live one answers
 * `conflict` — never a silent rename; a row purged in between answers
 * `not_found`. Runs through Drizzle because that path keeps the pg error code
 * (in `cause`); `PostgresService.query` strips it, and its `transaction`
 * would log the expected 23505 as a rollback error.
 */
export async function restoreOwnedRow(
  t: OwnedTrashTable,
  userId: string,
  id: string
): Promise<OwnedRestoreResult> {
  const found = await getTrashedOwnedRow(t, userId, id);
  if (typeof found === 'string') return found;
  try {
    const result = await getDrizzleInstance().execute(
      sql`UPDATE ${sql.raw(t.table)} SET deleted_at = NULL
          WHERE id = ${id} AND deleted_at IS NOT NULL RETURNING id`
    );
    return result.rows.length > 0 ? 'ok' : 'not_found';
  } catch (error) {
    if (isUniqueViolation(error)) return 'conflict';
    throw error;
  }
}

export function listTrashedOwnedRows<Row>(
  t: OwnedTrashTable,
  userId: string,
  opts: { limit: number; before: TrashCursor | null }
): Promise<Array<Trashed<Row>>> {
  const params: unknown[] = [userId];
  const keyset = trashKeysetWhere('deleted_at', 'id', opts.before, params);
  params.push(opts.limit);
  return getPostgresInstance().query<Trashed<Row>>(
    `SELECT ${t.columns}, deleted_at FROM ${t.table}
     WHERE deleted_at IS NOT NULL AND user_id = $1 AND ${keyset}
     ORDER BY ${trashOrderBy('deleted_at', 'id')}
     LIMIT $${params.length}`,
    params
  );
}

export async function listExpiredOwnedRows(
  t: OwnedTrashTable,
  cutoff: Date,
  limit: number
): Promise<Array<{ id: string; userId: string | null }>> {
  const rows = await getPostgresInstance().query<{ id: string; user_id: string | null }>(
    `SELECT id, user_id FROM ${t.table}
     WHERE deleted_at IS NOT NULL AND deleted_at < $1
     ORDER BY deleted_at LIMIT $2`,
    [cutoff, limit]
  );
  return rows.map((r) => ({ id: r.id, userId: r.user_id }));
}

/**
 * The conditional DELETE every purge starts with: only a trashed row, and
 * only one trashed before `cutoff` (any when null). Null means nothing was
 * deleted — restored meanwhile or already gone — and the caller must not
 * touch a side store. `returning` names the side-store handles to read.
 */
export async function deleteTrashedRow<R extends { id: string }>(
  t: OwnedTrashTable,
  id: string,
  cutoff: Date | null,
  returning = 'id'
): Promise<R | null> {
  if (!isRowId(id)) return null;
  const rows = await getPostgresInstance().query<R>(
    `DELETE FROM ${t.table}
     WHERE id = $1 AND deleted_at IS NOT NULL AND ($2::timestamptz IS NULL OR deleted_at < $2)
     RETURNING ${returning}`,
    [id, cutoff]
  );
  return rows[0] ?? null;
}

/**
 * One side store of a purge, after its row is gone: the row cannot come back,
 * so a failure is reported, never thrown.
 */
export async function purgeSideStore(
  kind: TrashKind,
  id: string,
  store: string,
  work: () => Promise<unknown>
): Promise<void> {
  try {
    await work();
  } catch (error) {
    reportBackgroundError(error, { job: 'trash-purge', kind, id, store });
  }
}

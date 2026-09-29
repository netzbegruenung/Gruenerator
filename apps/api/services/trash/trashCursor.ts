/**
 * Keyset pagination for the Papierkorb list.
 *
 * The key is `(deletedAt DESC, id ASC)`. `deletedAt` is truncated to
 * milliseconds on both sides: Postgres stores `now()` with microseconds, but the
 * `Date` node-postgres hands back has none, so the timestamp in a cursor is
 * already rounded down. Comparing it against the untruncated column would drop
 * every row that shares its millisecond but not its microsecond (the same trap
 * `routes/content/contentCursor.ts` documents). Ids compare byte-wise
 * (`COLLATE "C"`), which is what JS string comparison does too — a locale
 * collation may ignore the hyphens in a UUID and disagree with the merge.
 */

export interface TrashCursor {
  deletedAt: string;
  id: string;
}

export function encodeTrashCursor(cursor: TrashCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

/** Null for anything that is not a well-formed cursor. */
export function decodeTrashCursor(raw: string): TrashCursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { deletedAt, id } = parsed as Record<string, unknown>;
    if (typeof deletedAt !== 'string' || typeof id !== 'string') return null;
    if (Number.isNaN(Date.parse(deletedAt))) return null;
    return { deletedAt, id };
  } catch {
    return null;
  }
}

/** The order the merged list is sorted by; SQL below must agree with it exactly. */
export function compareTrashKey(a: TrashCursor, b: TrashCursor): number {
  const da = Date.parse(a.deletedAt);
  const db = Date.parse(b.deletedAt);
  if (da !== db) return db - da;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/** SQL expressions a handler sorts and pages by; `deletedAtColumn`/`idColumn` are caller-controlled SQL. */
export function trashOrderBy(deletedAtColumn: string, idColumn: string): string {
  return `date_trunc('milliseconds', ${deletedAtColumn}) DESC, ${idColumn}::text COLLATE "C" ASC`;
}

/**
 * The `WHERE` fragment that resumes after `cursor`, pushing its parameters onto
 * `params`. Returns `TRUE` without a cursor so callers can splice it in as-is.
 */
export function trashKeysetWhere(
  deletedAtColumn: string,
  idColumn: string,
  cursor: TrashCursor | null,
  params: unknown[]
): string {
  if (!cursor) return 'TRUE';
  const date = `date_trunc('milliseconds', ${deletedAtColumn})`;
  params.push(cursor.deletedAt);
  const d = `$${params.length}::timestamptz`;
  params.push(cursor.id);
  const i = `$${params.length}`;
  return `(${date} < ${d} OR (${date} = ${d} AND ${idColumn}::text COLLATE "C" > ${i}))`;
}

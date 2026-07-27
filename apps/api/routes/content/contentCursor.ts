import { type ContentKind } from '@gruenerator/contracts';

/**
 * Keyset pagination for the merged content feed.
 *
 * Offset pagination is wrong here: the tables grow while a user pages through
 * them, so `OFFSET 20` on page 2 skips whatever was inserted in between and
 * repeats whatever was pushed down. A cursor pins the exact position instead.
 *
 * `date` alone is not a total order — a bulk import writes many rows in the same
 * second, and reels fall back to `created_at` for projects never edited. So the
 * key is the triple `(date, kind, id)`, and every comparison, in SQL and in the
 * merge, uses all three in that order.
 */

/** Fixed order for the `kind` tiebreak. Never reorder — cursors encode indices. */
export const KIND_ORDER: readonly ContentKind[] = ['doc', 'board', 'image', 'video', 'canvas'];

export function kindRank(kind: ContentKind): number {
  return KIND_ORDER.indexOf(kind);
}

export interface ContentCursor {
  date: string;
  kind: ContentKind;
  id: string;
  /**
   * The `kind` filter the cursor was issued for. Paging on with a different
   * filter would skip and duplicate rows, so it is rejected rather than served.
   */
  kinds: ContentKind[];
}

export function encodeCursor(cursor: ContentCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

/** Returns null for anything that is not a well-formed cursor. */
export function decodeCursor(raw: string): ContentCursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { date, kind, id, kinds } = parsed as Record<string, unknown>;
    if (typeof date !== 'string' || typeof id !== 'string') return null;
    if (typeof kind !== 'string' || !KIND_ORDER.includes(kind as ContentKind)) return null;
    if (!Array.isArray(kinds) || !kinds.every((k) => KIND_ORDER.includes(k as ContentKind))) {
      return null;
    }
    return { date, kind: kind as ContentKind, id, kinds: kinds as ContentKind[] };
  } catch {
    return null;
  }
}

export function sameKindFilter(a: readonly ContentKind[], b: readonly ContentKind[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((kind, i) => kind === right[i]);
}

/**
 * The comparator the merged page is sorted by. SQL predicates below must agree
 * with it exactly, or a row lands on both pages or on neither.
 */
export function compareByKey(
  a: { date: string; kind: ContentKind; id: string },
  b: { date: string; kind: ContentKind; id: string }
): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  if (a.kind !== b.kind) return kindRank(a.kind) - kindRank(b.kind);
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
}

/**
 * The `WHERE` fragment that resumes one kind's query after the cursor position,
 * plus the parameters it needs.
 *
 * `kind` is constant within a query, so the three-way comparison collapses to a
 * single branch chosen here rather than evaluated per row:
 * - a kind that sorts *after* the cursor's kind may still take rows at the very
 *   same timestamp, so it uses `<=`;
 * - the cursor's own kind must skip past the exact row it names;
 * - a kind that sorts *before* it has already had its turn at that timestamp.
 *
 * `rawDateExpr` and `idExpr` are SQL the caller controls; neither is user input.
 *
 * The date is truncated to milliseconds on the SQL side. Postgres stores
 * `NOW()` with microsecond precision, but node-postgres hands us a JS `Date`,
 * which has none — so the timestamp we put in a cursor is already rounded down.
 * Comparing that rounded value against the untruncated column would drop every
 * row that shares its millisecond but not its microsecond. Truncating both
 * sides makes the SQL predicate and the JS comparator agree exactly. It costs
 * the index on that column, which only ever applies from page two onward:
 * `/api/recent-activity` and the first page pass no cursor at all.
 */
export function keysetWhere(
  rawDateExpr: string,
  idExpr: string,
  kind: ContentKind,
  cursor: ContentCursor,
  params: unknown[]
): string {
  const dateExpr = `date_trunc('milliseconds', ${rawDateExpr})`;
  const rank = kindRank(kind);
  const cursorRank = kindRank(cursor.kind);

  if (rank > cursorRank) {
    params.push(cursor.date);
    return `${dateExpr} <= $${params.length}::timestamptz`;
  }
  if (rank < cursorRank) {
    params.push(cursor.date);
    return `${dateExpr} < $${params.length}::timestamptz`;
  }

  params.push(cursor.date);
  const d = `$${params.length}::timestamptz`;
  params.push(cursor.id);
  const i = `$${params.length}`;
  return `(${dateExpr} < ${d} OR (${dateExpr} = ${d} AND ${idExpr}::text < ${i}))`;
}

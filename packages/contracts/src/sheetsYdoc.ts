/**
 * Y.Doc layout and pure formatting helpers for Univer 'sheets' documents.
 *
 * Univer-free on purpose: the editor (`packages/sheets`) and the API (which
 * ships without the Univer dependency tree) both import from here, so the
 * collab schema, the compaction boundary type, and the markdown-table format
 * have a single source of truth instead of two hand-kept copies.
 */

/** Y keys of a sheet document's shared Y.Doc. */
export const SHEET_YDOC_KEYS = {
  /** Y.Array<SheetMutationEntry> — append-only mutation log. */
  mutations: 'sheetMutations',
  /** Y.Map — workbook snapshot + compaction boundary + seed metadata. */
  meta: 'sheetMeta',
} as const;

export const SHEET_META_KEYS = {
  /** JSON string of the IWorkbookData snapshot. */
  snapshot: 'snapshot',
  /** SnapshotVector: which log entries the snapshot already folds in. */
  snapshotVector: 'snapshotVector',
  seeded: 'seeded',
  schemaVersion: 'schemaVersion',
} as const;

/** Bumped to 2 when the compaction boundary moved from a scalar seq to a
 *  per-client SnapshotVector (unique keys, no seq ties, failed replays never
 *  pruned). */
export const SHEET_SCHEMA_VERSION = 2;

/**
 * One entry in the mutation log. Identity is `(clientId, clientSeq)`:
 * `clientId` is the author's Yjs clientID (unique per session), `clientSeq`
 * is that author's own monotonic counter — so two concurrent authors never
 * collide on an identity the way a shared counter could.
 */
export interface SheetMutationEntry {
  clientId: number;
  clientSeq: number;
  /** Univer mutation id, e.g. 'sheet.mutation.set-range-values'. */
  id: string;
  /** JSON-serializable mutation params. */
  params: unknown;
  /** Wall-clock append time; idle-compaction heuristics only. */
  ts: number;
}

/**
 * Compaction boundary: per author (`clientId` as string key) the highest
 * `clientSeq` the snapshot already reflects. An entry is covered iff the
 * vector has its author at or beyond its `clientSeq`.
 */
export type SnapshotVector = Record<string, number>;

export function isSheetMutationEntry(value: unknown): value is SheetMutationEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['clientId'] === 'number' &&
    typeof v['clientSeq'] === 'number' &&
    typeof v['id'] === 'string'
  );
}

/** True iff the snapshot vector already folds in this entry. */
export function isEntryCovered(entry: SheetMutationEntry, vector: SnapshotVector): boolean {
  const hw = vector[String(entry.clientId)];
  return hw !== undefined && hw >= entry.clientSeq;
}

/** Entries a client still has to apply on top of the snapshot. */
export function uncoveredEntries(
  entries: readonly SheetMutationEntry[],
  vector: SnapshotVector
): SheetMutationEntry[] {
  return entries.filter((e) => !isEntryCovered(e, vector));
}

/**
 * How many leading log entries a compaction may prune: the longest prefix
 * that is fully covered by the vector. It stops at the first uncovered entry
 * (e.g. one whose replay failed and was therefore never added to the vector),
 * so un-applied edits are never dropped.
 */
export function coveredPrefixCount(
  entries: readonly SheetMutationEntry[],
  vector: SnapshotVector
): number {
  let count = 0;
  for (const e of entries) {
    if (isEntryCovered(e, vector)) count++;
    else break;
  }
  return count;
}

/** Mutates `vector` to also cover `entry`. */
export function coverEntry(vector: SnapshotVector, entry: SheetMutationEntry): void {
  const key = String(entry.clientId);
  const hw = vector[key];
  if (hw === undefined || entry.clientSeq > hw) vector[key] = entry.clientSeq;
}

/** Pure union of two vectors, taking the higher watermark per author. */
export function mergeVectors(a: SnapshotVector, b: SnapshotVector): SnapshotVector {
  const out: SnapshotVector = { ...a };
  for (const key of Object.keys(b)) {
    const bv = b[key]!;
    const av = out[key];
    if (av === undefined || bv > av) out[key] = bv;
  }
  return out;
}

/** A1 column label for a zero-based column index (0 → "A", 26 → "AA"). */
export function columnLabel(index: number): string {
  let label = '';
  let i = index;
  while (i >= 0) {
    label = String.fromCharCode(65 + (i % 26)) + label;
    i = Math.floor(i / 26) - 1;
  }
  return label;
}

/** Max characters per cell in the markdown-table context renderers. */
export const SHEET_MD_CELL_MAX = 120;

/** Escape + truncate a cell value for a markdown table cell. */
export function escapeMarkdownCell(value: unknown): string {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ').slice(0, SHEET_MD_CELL_MAX);
}

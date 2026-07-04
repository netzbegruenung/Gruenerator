/**
 * Y.Doc layout for a 'sheets' collaborative document (mutation-log collab).
 *
 * The Hocuspocus room is the document UUID (same as docs/boards/canvas); the
 * sheet editor owns two Y keys, following the canvas-editor "own keys"
 * precedent:
 *
 * - `sheetMutations` (Y.Array<SheetMutationEntry>): append-only log of Univer
 *   mutations. Remote clients replay entries via the command service with
 *   `{ onlyLocal: true, fromCollab: true }` so they aren't re-broadcast.
 * - `sheetMeta` (Y.Map): `snapshot` (JSON string of IWorkbookData),
 *   `snapshotSeq` (highest seq folded into the snapshot), `seeded`,
 *   `schemaVersion`. Late joiners load the snapshot, then replay the log tail
 *   with seq > snapshotSeq.
 *
 * The snapshot is a JSON string (not nested Y types) because it is always
 * replaced wholesale — one Yjs item per snapshot lets old ones be GC'd.
 */

export const SHEET_YDOC_KEYS = {
  mutations: 'sheetMutations',
  meta: 'sheetMeta',
} as const;

export const SHEET_META_KEYS = {
  snapshot: 'snapshot',
  snapshotSeq: 'snapshotSeq',
  seeded: 'seeded',
  schemaVersion: 'schemaVersion',
} as const;

export const SHEET_SCHEMA_VERSION = 1;

/** Transaction origins so our own observers can ignore our own writes. */
export const SHEET_LOCAL_ORIGIN = 'gruenerator-sheets-local';
export const SHEET_COMPACT_ORIGIN = 'gruenerator-sheets-compact';
export const SHEET_SEED_ORIGIN = 'gruenerator-sheets-seed';

export interface SheetMutationEntry {
  /** Monotonic-ish ordering key; ties between concurrent clients are fine. */
  seq: number;
  /** ydoc.clientID of the author (fresh per session — live-echo guard only). */
  clientId: number;
  /** Univer mutation id, e.g. 'sheet.mutation.set-range-values'. */
  id: string;
  /** JSON-serializable mutation params (serializable by Univer's contract). */
  params: unknown;
  /** Wall-clock append time; used for idle-compaction heuristics only. */
  ts: number;
}

export function isSheetMutationEntry(value: unknown): value is SheetMutationEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['seq'] === 'number' && typeof v['id'] === 'string' && typeof v['clientId'] === 'number'
  );
}

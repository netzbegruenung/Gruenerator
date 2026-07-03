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
 *   `snapshotVector` (per-author high-water of what the snapshot folds in),
 *   `seeded`, `schemaVersion`. Late joiners load the snapshot, then replay the
 *   entries the vector does not yet cover.
 *
 * The schema itself + the pure helpers live in `@gruenerator/contracts` so the
 * Univer-less API image shares one source of truth; this module re-exports
 * them and adds the frontend-only transaction origins.
 */

export {
  SHEET_YDOC_KEYS,
  SHEET_META_KEYS,
  SHEET_SCHEMA_VERSION,
  SHEET_MD_CELL_MAX,
  isSheetMutationEntry,
  isEntryCovered,
  uncoveredEntries,
  coveredPrefixCount,
  coverEntry,
  mergeVectors,
  columnLabel,
  escapeMarkdownCell,
  type SheetMutationEntry,
  type SnapshotVector,
} from '@gruenerator/contracts';

/** Transaction origins so our own observers can ignore our own writes. */
export const SHEET_LOCAL_ORIGIN = 'gruenerator-sheets-local';
export const SHEET_COMPACT_ORIGIN = 'gruenerator-sheets-compact';
export const SHEET_SEED_ORIGIN = 'gruenerator-sheets-seed';

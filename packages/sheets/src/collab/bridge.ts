import { CommandType } from '@univerjs/presets';
import * as Y from 'yjs';

import {
  SHEET_COMPACT_ORIGIN,
  SHEET_LOCAL_ORIGIN,
  SHEET_META_KEYS,
  SHEET_SCHEMA_VERSION,
  SHEET_SEED_ORIGIN,
  SHEET_YDOC_KEYS,
  coverEntry,
  coveredPrefixCount,
  isEntryCovered,
  isSheetMutationEntry,
  uncoveredEntries,
  type SheetMutationEntry,
  type SnapshotVector,
} from '../lib/ydocSchema.js';
import { buildBlankWorkbook } from '../lib/blankWorkbook.js';
import { COMPACT_IDLE_MS, COMPACT_THRESHOLD, isCompactionLeader } from './compaction.js';

import type { FWorkbook } from '@univerjs/preset-sheets-core';
import type { FUniver, IWorkbookData } from '@univerjs/presets';

/** Minimal awareness surface (from @hocuspocus/provider / y-protocols). */
export interface AwarenessLike {
  clientID: number;
  getStates(): Map<number, Record<string, unknown> | null>;
  setLocalStateField(field: string, value: unknown): void;
  on(event: 'change', cb: () => void): void;
  off(event: 'change', cb: () => void): void;
}

export interface AttachYjsBridgeOptions {
  univerAPI: FUniver;
  ydoc: Y.Doc;
  /** collaborative_documents UUID — forced as the workbook unitId on all clients. */
  documentId: string;
  /** Write access of the local user; read-only clients never compact or forward. */
  canWrite: boolean;
  awareness?: AwarenessLike | null;
}

export interface SheetsBridge {
  workbook: FWorkbook;
  dispose(): void;
}

/** Univer mutations that are session-local bookkeeping despite lacking
 * `onlyLocal` tagging. Grown from observed traffic during manual testing. */
const LOCAL_ONLY_MUTATIONS = new Set<string>(['sheet.mutation.set-worksheet-active-operation']);

function readSnapshotVector(yMeta: Y.Map<unknown>): SnapshotVector {
  const raw = yMeta.get(SHEET_META_KEYS.snapshotVector);
  if (typeof raw !== 'object' || raw === null) return {};
  const out: SnapshotVector = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'number') out[key] = value;
  }
  return out;
}

/**
 * Connects a Univer sheets instance to the shared Y.Doc (mutation-log collab).
 *
 * Identity + boundary use a per-client version vector (`SnapshotVector`), not a
 * shared scalar seq: every entry is `(clientId, clientSeq)` (unique, no ties),
 * and the snapshot carries the exact set of entries it folds in. An entry is
 * only ever pruned once the vector covers it — so a failed replay (kept out of
 * the vector) survives in the log for late joiners instead of being erased.
 *
 * Attach order matters: load snapshot → replay uncovered entries → register the
 * local→remote forwarder and the remote→local observer. Registering the
 * forwarder last keeps the initial replay from being re-broadcast.
 */
export function attachYjsBridge({
  univerAPI,
  ydoc,
  documentId,
  canWrite,
  awareness,
}: AttachYjsBridgeOptions): SheetsBridge {
  const yMutations = ydoc.getArray<SheetMutationEntry>(SHEET_YDOC_KEYS.mutations);
  const yMeta = ydoc.getMap<unknown>(SHEET_YDOC_KEYS.meta);

  let applyingRemote = false;
  let disposed = false;
  // What THIS client has folded into its live workbook (snapshot coverage +
  // everything applied since). Authoritative for our own skip/compaction — we
  // never adopt a remote leader's coverage, because we don't reload its
  // snapshot and must apply every entry ourselves.
  const appliedVector: SnapshotVector = {};
  // Our own author counter for this session (clientId is fresh per Y.Doc).
  let localSeq = 0;

  // ── 1. Load snapshot (or seed a blank workbook) ────────────────────────────
  const snapshotJson = yMeta.get(SHEET_META_KEYS.snapshot);
  const loadedVector = readSnapshotVector(yMeta);
  for (const [key, value] of Object.entries(loadedVector)) appliedVector[key] = value;

  const parsedSnapshot =
    typeof snapshotJson === 'string' && snapshotJson.length > 0
      ? (JSON.parse(snapshotJson) as IWorkbookData)
      : null;
  // A snapshot with zero worksheets is a pre-fix blank seed (`sheets: {}`) that
  // Univer renders as no grid. Treat it as absent so we re-seed one worksheet —
  // otherwise sheets created during the broken window stay permanently blank.
  const snapshotHasWorksheet =
    !!parsedSnapshot &&
    Array.isArray(parsedSnapshot.sheetOrder) &&
    parsedSnapshot.sheetOrder.length > 0 &&
    Object.keys(parsedSnapshot.sheets ?? {}).length > 0;

  let workbook: FWorkbook;
  if (parsedSnapshot && snapshotHasWorksheet) {
    // All clients must share one unitId, or mutation params won't match.
    parsedSnapshot.id = documentId;
    workbook = univerAPI.createWorkbook(parsedSnapshot);
  } else {
    workbook = univerAPI.createWorkbook(buildBlankWorkbook(documentId));
    // Seed a fresh blank sheet, OR repair a broken zero-worksheet snapshot
    // (overwrite even if `seeded` was set, since that snapshot is unusable).
    const brokenSnapshot = !!parsedSnapshot && !snapshotHasWorksheet;
    const needsSeed = yMeta.get(SHEET_META_KEYS.seeded) !== true || brokenSnapshot;
    if (canWrite && needsSeed) {
      // Guarded seed: StrictMode double-mounts and two-tab races both write
      // equivalent blank state, so last-writer-wins on 'seeded' is fine.
      ydoc.transact(() => {
        yMeta.set(SHEET_META_KEYS.snapshot, JSON.stringify(workbook.save()));
        yMeta.set(SHEET_META_KEYS.snapshotVector, {});
        yMeta.set(SHEET_META_KEYS.seeded, true);
        yMeta.set(SHEET_META_KEYS.schemaVersion, SHEET_SCHEMA_VERSION);
      }, SHEET_SEED_ORIGIN);
    }
  }

  // ── 2. Replay entries the snapshot doesn't already cover ───────────────────
  const entries = yMutations.toArray().filter(isSheetMutationEntry);
  applyingRemote = true;
  try {
    for (const entry of uncoveredEntries(entries, appliedVector)) {
      try {
        void univerAPI.executeCommand(entry.id, entry.params as object, {
          onlyLocal: true,
          fromCollab: true,
        });
        coverEntry(appliedVector, entry);
      } catch (err) {
        // Best-effort convergence: a failed replay (e.g. structural conflict)
        // is accepted and, crucially, NOT covered — so compaction won't prune
        // it and a later client can still try to apply it.
        console.error('[sheets-bridge] replay failed:', entry.id, err);
      }
    }
  } finally {
    applyingRemote = false;
  }

  // ── 3. Local → remote: forward mutations into the log ─────────────────────
  let pending: Omit<SheetMutationEntry, 'clientSeq'>[] = [];
  let flushScheduled = false;

  const flush = () => {
    flushScheduled = false;
    if (disposed || pending.length === 0) return;
    const batch = pending;
    pending = [];
    ydoc.transact(() => {
      for (const item of batch) {
        const entry: SheetMutationEntry = { ...item, clientSeq: localSeq++ };
        yMutations.push([entry]);
        coverEntry(appliedVector, entry); // local mutations are already applied
      }
    }, SHEET_LOCAL_ORIGIN);
    maybeCompact();
  };

  const commandDisposable = univerAPI.onCommandExecuted((commandInfo, options) => {
    if (disposed || applyingRemote) return;
    if (commandInfo.type !== CommandType.MUTATION) return;
    if (options?.onlyLocal || options?.fromCollab || options?.fromChangeset) return;
    if (LOCAL_ONLY_MUTATIONS.has(commandInfo.id)) return;
    // Only mutations for our unit; ignore internal editor docs (cell editor
    // runs a doc unit whose mutations must not enter the sheet log).
    const params = commandInfo.params as { unitId?: string } | undefined;
    if (params?.unitId && params.unitId !== documentId) return;
    pending.push({
      clientId: ydoc.clientID,
      id: commandInfo.id,
      params: structuredClone(commandInfo.params ?? {}),
      ts: Date.now(),
    });
    if (!flushScheduled) {
      flushScheduled = true;
      queueMicrotask(flush);
    }
  });

  // ── 4. Remote → local: replay observed inserts ─────────────────────────────
  const observer = (event: Y.YArrayEvent<SheetMutationEntry>, txn: Y.Transaction) => {
    if (disposed) return;
    if (txn.origin === SHEET_LOCAL_ORIGIN || txn.origin === SHEET_COMPACT_ORIGIN) return;
    const inserted: SheetMutationEntry[] = [];
    for (const delta of event.changes.delta) {
      if (delta.insert) {
        for (const item of delta.insert as unknown[]) {
          if (isSheetMutationEntry(item)) inserted.push(item);
        }
      }
    }
    if (inserted.length === 0) return;
    applyingRemote = true;
    try {
      for (const entry of inserted) {
        if (entry.clientId === ydoc.clientID) continue; // our own, already applied
        if (isEntryCovered(entry, appliedVector)) continue; // already folded in
        try {
          void univerAPI.executeCommand(entry.id, entry.params as object, {
            onlyLocal: true,
            fromCollab: true,
          });
          coverEntry(appliedVector, entry);
        } catch (err) {
          console.error('[sheets-bridge] remote apply failed:', entry.id, err);
        }
      }
    } finally {
      applyingRemote = false;
    }
    maybeCompact();
  };
  yMutations.observe(observer);

  // ── 5. Compaction (leader only) ────────────────────────────────────────────
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const compact = () => {
    const current = yMutations.toArray().filter(isSheetMutationEntry);
    if (current.length === 0) return;
    // Snapshot exactly what we've applied; prune only the leading run of
    // entries that snapshot covers (stops at the first un-applied entry).
    const prune = coveredPrefixCount(current, appliedVector);
    ydoc.transact(() => {
      yMeta.set(SHEET_META_KEYS.snapshot, JSON.stringify(workbook.save()));
      yMeta.set(SHEET_META_KEYS.snapshotVector, { ...appliedVector });
      if (prune > 0) yMutations.delete(0, prune);
    }, SHEET_COMPACT_ORIGIN);
  };

  const maybeCompact = () => {
    if (disposed || !canWrite) return;
    const awarenessStates = awareness?.getStates();
    const states =
      awarenessStates && awarenessStates.size > 0
        ? awarenessStates
        : new Map([[ydoc.clientID, { canWrite }]]);
    if (!isCompactionLeader(ydoc.clientID, states)) return;
    if (yMutations.length >= COMPACT_THRESHOLD) {
      compact();
      return;
    }
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!disposed && yMutations.length > 0) compact();
    }, COMPACT_IDLE_MS);
  };

  // Advertise write access for leader election.
  awareness?.setLocalStateField('canWrite', canWrite);

  return {
    workbook,
    dispose() {
      disposed = true;
      if (idleTimer) clearTimeout(idleTimer);
      commandDisposable.dispose();
      yMutations.unobserve(observer);
    },
  };
}

import { CommandType } from '@univerjs/presets';
import * as Y from 'yjs';

import {
  SHEET_COMPACT_ORIGIN,
  SHEET_LOCAL_ORIGIN,
  SHEET_META_KEYS,
  SHEET_SCHEMA_VERSION,
  SHEET_SEED_ORIGIN,
  SHEET_YDOC_KEYS,
  isSheetMutationEntry,
  type SheetMutationEntry,
} from '../lib/ydocSchema.js';
import {
  COMPACT_IDLE_MS,
  COMPACT_THRESHOLD,
  isCompactionLeader,
  maxSeq,
  nextSeq,
  pruneCount,
  tailEntries,
} from './compaction.js';

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

function buildBlankWorkbook(documentId: string): Partial<IWorkbookData> {
  return {
    id: documentId,
    name: 'Tabelle',
    sheetOrder: [],
    sheets: {},
  };
}

/**
 * Connects a Univer sheets instance to the shared Y.Doc (mutation-log collab).
 *
 * Attach order matters: load snapshot → replay log tail → register the
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

  // ── 1. Load snapshot (or seed a blank workbook) ────────────────────────────
  const snapshotJson = yMeta.get(SHEET_META_KEYS.snapshot);
  let snapshotSeq =
    typeof yMeta.get(SHEET_META_KEYS.snapshotSeq) === 'number'
      ? (yMeta.get(SHEET_META_KEYS.snapshotSeq) as number)
      : -1;

  let workbook: FWorkbook;
  if (typeof snapshotJson === 'string' && snapshotJson.length > 0) {
    const data = JSON.parse(snapshotJson) as IWorkbookData;
    // All clients must share one unitId, or mutation params won't match.
    data.id = documentId;
    workbook = univerAPI.createWorkbook(data);
  } else {
    workbook = univerAPI.createWorkbook(buildBlankWorkbook(documentId));
    if (canWrite && yMeta.get(SHEET_META_KEYS.seeded) !== true) {
      // Guarded seed: StrictMode double-mounts and two-tab races both write
      // equivalent blank state, so last-writer-wins on 'seeded' is fine.
      ydoc.transact(() => {
        yMeta.set(SHEET_META_KEYS.snapshot, JSON.stringify(workbook.save()));
        yMeta.set(SHEET_META_KEYS.snapshotSeq, -1);
        yMeta.set(SHEET_META_KEYS.seeded, true);
        yMeta.set(SHEET_META_KEYS.schemaVersion, SHEET_SCHEMA_VERSION);
      }, SHEET_SEED_ORIGIN);
    }
  }

  // ── 2. Replay log tail on top of the snapshot ──────────────────────────────
  const entries = yMutations.toArray().filter(isSheetMutationEntry);
  let lastAppliedSeq = snapshotSeq;
  applyingRemote = true;
  try {
    for (const entry of tailEntries(entries, snapshotSeq)) {
      try {
        void univerAPI.executeCommand(entry.id, entry.params as object, {
          onlyLocal: true,
          fromCollab: true,
        });
        if (entry.seq > lastAppliedSeq) lastAppliedSeq = entry.seq;
      } catch (err) {
        // Best-effort convergence: a failed replay (e.g. structural conflict)
        // is accepted; frequent compaction keeps divergence windows short.
        console.error('[sheets-bridge] replay failed:', entry.id, err);
      }
    }
  } finally {
    applyingRemote = false;
  }

  // ── 3. Local → remote: forward mutations into the log ─────────────────────
  let pending: Omit<SheetMutationEntry, 'seq'>[] = [];
  let flushScheduled = false;

  const flush = () => {
    flushScheduled = false;
    if (disposed || pending.length === 0) return;
    const batch = pending;
    pending = [];
    ydoc.transact(() => {
      let seq = nextSeq(yMutations.toArray().filter(isSheetMutationEntry), snapshotSeq);
      for (const item of batch) {
        yMutations.push([{ ...item, seq }]);
        if (seq > lastAppliedSeq) lastAppliedSeq = seq;
        seq++;
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
        if (entry.clientId === ydoc.clientID) continue;
        if (entry.seq <= snapshotSeq) continue;
        try {
          void univerAPI.executeCommand(entry.id, entry.params as object, {
            onlyLocal: true,
            fromCollab: true,
          });
        } catch (err) {
          console.error('[sheets-bridge] remote apply failed:', entry.id, err);
        }
        if (entry.seq > lastAppliedSeq) lastAppliedSeq = entry.seq;
      }
    } finally {
      applyingRemote = false;
    }
    maybeCompact();
  };
  yMutations.observe(observer);

  // Track remote compactions so our local snapshotSeq boundary stays current.
  const metaObserver = () => {
    const remoteSeq = yMeta.get(SHEET_META_KEYS.snapshotSeq);
    if (typeof remoteSeq === 'number' && remoteSeq > snapshotSeq) snapshotSeq = remoteSeq;
  };
  yMeta.observe(metaObserver);

  // ── 5. Compaction (leader only) ────────────────────────────────────────────
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const compact = () => {
    const current = yMutations.toArray().filter(isSheetMutationEntry);
    if (current.length === 0) return;
    const newSnapshotSeq = maxSeq(current, snapshotSeq);
    const prune = pruneCount(current, newSnapshotSeq);
    ydoc.transact(() => {
      yMeta.set(SHEET_META_KEYS.snapshot, JSON.stringify(workbook.save()));
      yMeta.set(SHEET_META_KEYS.snapshotSeq, newSnapshotSeq);
      if (prune > 0) yMutations.delete(0, prune);
    }, SHEET_COMPACT_ORIGIN);
    snapshotSeq = newSnapshotSeq;
  };

  const maybeCompact = () => {
    if (disposed || !canWrite) return;
    const states = awareness?.getStates() ?? new Map([[ydoc.clientID, { canWrite }]]);
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
      yMeta.unobserve(metaObserver);
    },
  };
}

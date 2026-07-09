import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import {
  SHEET_META_KEYS,
  SHEET_YDOC_KEYS,
  coverEntry,
  coveredPrefixCount,
  isEntryCovered,
  mergeVectors,
  uncoveredEntries,
  type SheetMutationEntry,
  type SnapshotVector,
} from '../lib/ydocSchema.js';
import { isCompactionLeader } from './compaction.js';

const entry = (clientId: number, clientSeq: number): SheetMutationEntry => ({
  clientId,
  clientSeq,
  id: 'sheet.mutation.set-range-values',
  params: { clientId, clientSeq },
  ts: 0,
});

describe('version-vector helpers', () => {
  it('coverEntry raises the per-author high-water', () => {
    const v: SnapshotVector = {};
    coverEntry(v, entry(1, 0));
    coverEntry(v, entry(1, 3));
    coverEntry(v, entry(2, 1));
    expect(v).toEqual({ '1': 3, '2': 1 });
  });

  it('isEntryCovered respects per-author watermarks', () => {
    const v: SnapshotVector = { '1': 2 };
    expect(isEntryCovered(entry(1, 2), v)).toBe(true);
    expect(isEntryCovered(entry(1, 3), v)).toBe(false);
    expect(isEntryCovered(entry(2, 0), v)).toBe(false); // author unknown → uncovered
  });

  it('uncoveredEntries keeps only what the vector does not cover', () => {
    const entries = [entry(1, 0), entry(1, 1), entry(2, 0)];
    const tail = uncoveredEntries(entries, { '1': 0 });
    expect(tail).toEqual([entry(1, 1), entry(2, 0)]);
  });

  it('coveredPrefixCount stops at the first uncovered entry (failed replay is never pruned)', () => {
    // Author 2's entry replay failed → not in the vector; it and everything
    // after it must survive pruning even though author 1's later entry IS covered.
    const entries = [entry(1, 0), entry(2, 0), entry(1, 1)];
    expect(coveredPrefixCount(entries, { '1': 1 })).toBe(1);
  });

  it('mergeVectors takes the higher watermark per author', () => {
    expect(mergeVectors({ '1': 2, '2': 5 }, { '1': 4, '3': 1 })).toEqual({
      '1': 4,
      '2': 5,
      '3': 1,
    });
  });
});

describe('leader election', () => {
  it('elects the lowest writable clientID', () => {
    const states = new Map<number, Record<string, unknown> | null>([
      [7, { canWrite: true }],
      [3, { canWrite: false }],
      [12, { canWrite: true }],
    ]);
    expect(isCompactionLeader(7, states)).toBe(true);
    expect(isCompactionLeader(12, states)).toBe(false);
    expect(isCompactionLeader(3, states)).toBe(false);
  });

  it('elects nobody when no client declares write access', () => {
    const states = new Map<number, Record<string, unknown> | null>([[3, { canWrite: false }]]);
    expect(isCompactionLeader(3, states)).toBe(false);
  });
});

describe('mutation log across two Y.Docs', () => {
  const sync = (a: Y.Doc, b: Y.Doc) => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
  };

  it('late joiner sees snapshot vector + uncovered tail after compaction prunes the log', () => {
    const docA = new Y.Doc();
    const logA = docA.getArray<SheetMutationEntry>(SHEET_YDOC_KEYS.mutations);
    const metaA = docA.getMap<unknown>(SHEET_YDOC_KEYS.meta);

    docA.transact(() => {
      metaA.set(SHEET_META_KEYS.snapshot, JSON.stringify({ id: 'doc-1' }));
      metaA.set(SHEET_META_KEYS.snapshotVector, {});
      for (let i = 0; i < 5; i++) logA.push([entry(1, i)]);
    });

    // Leader applied author-1 seq 0..4, snapshots + prunes the covered prefix.
    const vector: SnapshotVector = { '1': 4 };
    docA.transact(() => {
      metaA.set(SHEET_META_KEYS.snapshot, JSON.stringify({ id: 'doc-1', upTo: 4 }));
      metaA.set(SHEET_META_KEYS.snapshotVector, vector);
      logA.delete(0, coveredPrefixCount(logA.toArray(), vector));
    });
    logA.push([entry(1, 5), entry(1, 6)]);

    const docB = new Y.Doc();
    sync(docA, docB);
    const logB = docB.getArray<SheetMutationEntry>(SHEET_YDOC_KEYS.mutations);
    const metaB = docB.getMap<unknown>(SHEET_YDOC_KEYS.meta);

    const loadedVector = metaB.get(SHEET_META_KEYS.snapshotVector) as SnapshotVector;
    expect(loadedVector).toEqual({ '1': 4 });
    expect(JSON.parse(metaB.get(SHEET_META_KEYS.snapshot) as string)).toEqual({
      id: 'doc-1',
      upTo: 4,
    });
    expect(uncoveredEntries(logB.toArray(), loadedVector).map((e) => e.clientSeq)).toEqual([5, 6]);
  });

  it('concurrent appends from two authors keep distinct identities (no seq tie)', () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    docA.getArray(SHEET_YDOC_KEYS.mutations);
    docB.getArray(SHEET_YDOC_KEYS.mutations);
    sync(docA, docB);

    docA.getArray<SheetMutationEntry>(SHEET_YDOC_KEYS.mutations).push([entry(1, 0)]);
    docB.getArray<SheetMutationEntry>(SHEET_YDOC_KEYS.mutations).push([entry(2, 0)]);
    sync(docA, docB);

    const a = docA.getArray<SheetMutationEntry>(SHEET_YDOC_KEYS.mutations).toArray();
    const b = docB.getArray<SheetMutationEntry>(SHEET_YDOC_KEYS.mutations).toArray();
    expect(a).toHaveLength(2);
    expect(a).toEqual(b); // both docs converge to the same order
    // Both survive an uncovered check — neither shadows the other on seq
    // (order is Yjs-deterministic but not asserted here).
    expect(
      uncoveredEntries(a, {})
        .map((e) => `${e.clientId}:${e.clientSeq}`)
        .sort()
    ).toEqual(['1:0', '2:0']);
  });

  it("a leader that failed to apply a peer's entry does not prune it", () => {
    const doc = new Y.Doc();
    const log = doc.getArray<SheetMutationEntry>(SHEET_YDOC_KEYS.mutations);
    log.push([entry(1, 0), entry(2, 0), entry(1, 1)]);

    // Leader applied all of author 1 but author 2's replay threw → 2 stays uncovered.
    const vector: SnapshotVector = { '1': 1 };
    const prune = coveredPrefixCount(log.toArray(), vector);
    doc.transact(() => log.delete(0, prune));

    // Only the leading covered entry (author 1 seq 0) is pruned; author 2's
    // un-applied entry survives for a future client to retry.
    expect(log.toArray().map((e) => `${e.clientId}:${e.clientSeq}`)).toEqual(['2:0', '1:1']);
    expect(
      uncoveredEntries(log.toArray(), vector).map((e) => `${e.clientId}:${e.clientSeq}`)
    ).toEqual(['2:0']);
  });
});

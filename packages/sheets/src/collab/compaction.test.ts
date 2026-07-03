import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { SHEET_META_KEYS, SHEET_YDOC_KEYS, type SheetMutationEntry } from '../lib/ydocSchema.js';
import { isCompactionLeader, maxSeq, nextSeq, pruneCount, tailEntries } from './compaction.js';

const entry = (seq: number, clientId = 1): SheetMutationEntry => ({
  seq,
  clientId,
  id: 'sheet.mutation.set-range-values',
  params: { seq },
  ts: 0,
});

describe('compaction helpers', () => {
  it('nextSeq continues after the highest log entry', () => {
    expect(nextSeq([entry(3), entry(7), entry(5)], -1)).toBe(8);
  });

  it('nextSeq falls back to snapshotSeq + 1 on an empty log', () => {
    expect(nextSeq([], 41)).toBe(42);
  });

  it('tailEntries keeps only entries newer than the snapshot', () => {
    const tail = tailEntries([entry(1), entry(2), entry(3)], 2);
    expect(tail.map((e) => e.seq)).toEqual([3]);
  });

  it('maxSeq covers concurrent duplicate seqs', () => {
    expect(maxSeq([entry(6, 1), entry(6, 2)], 5)).toBe(6);
  });

  it('pruneCount only counts the covered prefix', () => {
    expect(pruneCount([entry(1), entry(2), entry(9)], 2)).toBe(2);
  });

  it('elects the lowest writable clientID as leader', () => {
    const states = new Map<number, Record<string, unknown> | null>([
      [7, { canWrite: true }],
      [3, { canWrite: false }],
      [12, { canWrite: true }],
    ]);
    expect(isCompactionLeader(7, states)).toBe(true);
    expect(isCompactionLeader(12, states)).toBe(false);
    expect(isCompactionLeader(3, states)).toBe(false);
  });

  it('read-only-only rooms elect nobody', () => {
    const states = new Map<number, Record<string, unknown> | null>([[3, { canWrite: false }]]);
    expect(isCompactionLeader(3, states)).toBe(false);
  });
});

describe('mutation log across two Y.Docs', () => {
  const sync = (a: Y.Doc, b: Y.Doc) => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
  };

  it('late joiner sees snapshot + tail after compaction prunes the log', () => {
    const docA = new Y.Doc();
    const logA = docA.getArray<SheetMutationEntry>(SHEET_YDOC_KEYS.mutations);
    const metaA = docA.getMap<unknown>(SHEET_YDOC_KEYS.meta);

    docA.transact(() => {
      metaA.set(SHEET_META_KEYS.snapshot, JSON.stringify({ id: 'doc-1' }));
      metaA.set(SHEET_META_KEYS.snapshotSeq, -1);
      for (let i = 0; i < 5; i++) logA.push([entry(i)]);
    });

    // Leader compacts: snapshot folds seq 0..4, prunes them, then two more edits land.
    docA.transact(() => {
      metaA.set(SHEET_META_KEYS.snapshot, JSON.stringify({ id: 'doc-1', upTo: 4 }));
      metaA.set(SHEET_META_KEYS.snapshotSeq, 4);
      logA.delete(0, pruneCount(logA.toArray(), 4));
    });
    logA.push([entry(5), entry(6)]);

    const docB = new Y.Doc();
    sync(docA, docB);
    const logB = docB.getArray<SheetMutationEntry>(SHEET_YDOC_KEYS.mutations);
    const metaB = docB.getMap<unknown>(SHEET_YDOC_KEYS.meta);

    const snapshotSeq = metaB.get(SHEET_META_KEYS.snapshotSeq) as number;
    expect(snapshotSeq).toBe(4);
    expect(JSON.parse(metaB.get(SHEET_META_KEYS.snapshot) as string)).toEqual({
      id: 'doc-1',
      upTo: 4,
    });
    expect(tailEntries(logB.toArray(), snapshotSeq).map((e) => e.seq)).toEqual([5, 6]);
  });

  it('concurrent appends from two clients all survive a merge', () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    docA.getArray(SHEET_YDOC_KEYS.mutations);
    docB.getArray(SHEET_YDOC_KEYS.mutations);
    sync(docA, docB);

    docA.getArray<SheetMutationEntry>(SHEET_YDOC_KEYS.mutations).push([entry(0, 1)]);
    docB.getArray<SheetMutationEntry>(SHEET_YDOC_KEYS.mutations).push([entry(0, 2)]);
    sync(docA, docB);

    const a = docA.getArray<SheetMutationEntry>(SHEET_YDOC_KEYS.mutations).toArray();
    const b = docB.getArray<SheetMutationEntry>(SHEET_YDOC_KEYS.mutations).toArray();
    expect(a).toHaveLength(2);
    expect(a).toEqual(b);
    expect(nextSeq(a, -1)).toBe(1);
  });

  it('prune concurrent with a remote append never drops the new entry', () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const logA = docA.getArray<SheetMutationEntry>(SHEET_YDOC_KEYS.mutations);
    const logB = docB.getArray<SheetMutationEntry>(SHEET_YDOC_KEYS.mutations);
    logA.push([entry(0), entry(1)]);
    sync(docA, docB);

    // A prunes 0..1 while B concurrently appends seq 2.
    logA.delete(0, 2);
    logB.push([entry(2, 2)]);
    sync(docA, docB);

    expect(logA.toArray().map((e) => e.seq)).toEqual([2]);
    expect(logB.toArray().map((e) => e.seq)).toEqual([2]);
  });
});

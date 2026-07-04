import { type SheetMutationEntry } from '../lib/ydocSchema.js';

/** Compact once the log holds this many entries… */
export const COMPACT_THRESHOLD = 200;
/** …or after this much idle time with a non-empty log. */
export const COMPACT_IDLE_MS = 30_000;

/**
 * Deterministic leader election without coordination: the lowest Yjs clientID
 * among currently-online awareness states that declared write access performs
 * compaction. clientIDs are unique per session, so there are no ties.
 */
export function isCompactionLeader(
  clientID: number,
  awarenessStates: Map<number, Record<string, unknown> | null>
): boolean {
  let min = Number.POSITIVE_INFINITY;
  for (const [id, state] of awarenessStates) {
    if (state && state['canWrite'] === true) min = Math.min(min, id);
  }
  return min === clientID;
}

/** Next seq for a locally-appended entry. */
export function nextSeq(entries: readonly SheetMutationEntry[], snapshotSeq: number): number {
  let max = snapshotSeq;
  for (const e of entries) if (e.seq > max) max = e.seq;
  return max + 1;
}

/** Log tail a late joiner must replay on top of the snapshot. */
export function tailEntries(
  entries: readonly SheetMutationEntry[],
  snapshotSeq: number
): SheetMutationEntry[] {
  return entries.filter((e) => e.seq > snapshotSeq);
}

/** Highest seq present in the log (or snapshotSeq when empty). */
export function maxSeq(entries: readonly SheetMutationEntry[], snapshotSeq: number): number {
  return nextSeq(entries, snapshotSeq) - 1;
}

/**
 * How many leading log entries a compaction may prune. Entries are pruned
 * only when their seq is covered by the new snapshotSeq; because remote
 * entries are applied synchronously on observation, every entry present at
 * compaction time is already folded into the leader's workbook state.
 */
export function pruneCount(entries: readonly SheetMutationEntry[], newSnapshotSeq: number): number {
  let count = 0;
  for (const e of entries) {
    if (e.seq <= newSnapshotSeq) count++;
    else break;
  }
  return count;
}

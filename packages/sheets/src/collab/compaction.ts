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

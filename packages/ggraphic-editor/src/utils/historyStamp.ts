// SPDX-License-Identifier: MPL-2.0
/**
 * The editor keeps two histories: each page's element history (its canvas
 * store) and the page-level one (page ops and `replaceDeck`, a Y.UndoManager).
 * Undo and Redo must walk both in the order the steps were taken, so every
 * step carries a stamp from this one clock.
 *
 * Preferring the page history whenever it had anything to undo made a deck
 * replacement (a Vorlage for all slides) unreachable after any older edit on
 * the active page: Undo reverted that page alone, the others stayed replaced.
 */

let last = 0;

/** Strictly increasing, roughly `Date.now()`; two steps never share a stamp. */
export function nextHistoryStamp(): number {
  last = Math.max(Date.now(), last + 1);
  return last;
}

/** Stamp of the step Undo would take back, and of the step Redo would restore. */
export interface HistoryStamps {
  undo: number | null;
  redo: number | null;
}

/**
 * Which history an Undo or Redo reaches: Undo takes back the newer step of the
 * two, Redo restores the older of the two undone ones. Null when neither has one.
 */
export function routeHistory(
  kind: 'undo' | 'redo',
  page: HistoryStamps | null,
  pageOps: HistoryStamps
): 'page' | 'pageOps' | null {
  const own = page?.[kind] ?? null;
  const ops = pageOps[kind];
  if (own === null) return ops === null ? null : 'pageOps';
  if (ops === null) return 'page';
  const pageFirst = kind === 'undo' ? own > ops : own < ops;
  return pageFirst ? 'page' : 'pageOps';
}

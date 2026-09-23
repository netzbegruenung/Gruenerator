/**
 * Pure helpers for the filtered `documents` arm of `annRecallCheck.ts` (#3189).
 * Kept apart from the script so they can be tested without a live Qdrant.
 */

import { type RetrievalCase } from './cases.js';

export interface RecallStats {
  overlap: number;
  total: number;
}

/**
 * One document-id filter per distinct notebook. Two eval cases pointing at the
 * same document set would otherwise run the same query twice and count it twice.
 */
export function distinctNotebookFilters(
  cases: RetrievalCase[]
): Array<{ label: string; documentIds: string[] }> {
  const byKey = new Map<string, { label: string; documentIds: string[] }>();
  for (const evalCase of cases) {
    const documentIds = evalCase.notebook?.user?.documentIds;
    if (evalCase.kind !== 'notebook' || !documentIds || documentIds.length === 0) continue;
    const key = [...documentIds].sort().join(',');
    if (!byKey.has(key)) byKey.set(key, { label: evalCase.id, documentIds });
  }
  return [...byKey.values()];
}

/**
 * Whether a filter was answered by a full scan rather than by HNSW.
 *
 * Below `full_scan_threshold` (checked per segment) Qdrant scans the filtered
 * points exactly through the payload index, so "approximate" equals exact by
 * construction and a 100 % recall says nothing about the graph. The control is
 * `hnsw_ef: 1`: a real graph walk with the smallest beam loses neighbours
 * (measured 73-89 % on `documents`), a full scan cannot.
 */
export function answeredByFullScan(minimalEf: RecallStats): boolean {
  return minimalEf.total > 0 && minimalEf.overlap === minimalEf.total;
}

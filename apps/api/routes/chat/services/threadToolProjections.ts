/**
 * The pure projections over a thread's persisted `tool_results` rows, newest
 * first. Split from `threadPersistenceService` (which reads them from Postgres)
 * so the integration harness's in-memory thread store can build the same tool
 * history from its own messages instead of returning an empty one.
 */

import { type PersistedStep } from './agenticLoop/types.js';

import type { SearchResult } from '../../../agents/langgraph/ChatGraph/types.js';

/** The `tool_results` keys these projections read. */
export interface ToolStepRow {
  toolCalls?: unknown;
  searchResults?: unknown[] | null;
}

/**
 * How deep each projection looks into the thread. Four functions used to run
 * the SAME query — `thread_id`, `role='assistant'`, `tool_results IS NOT NULL`,
 * newest first — differing in nothing but this number, and a single loop turn
 * fired three of them.
 *
 * The windows stay PER PROJECTION on purpose. The widest is read once and each
 * projection slices its own depth, so unifying the read does not quietly change
 * how far back replay or source rehydration reaches. Whether artifacts really
 * need 20 where sources get 12 is a product question; this is not the change
 * that answers it.
 */
export const ROW_WINDOW = {
  artifacts: 20,
  toolSteps: 12,
  sources: 12,
  lastImage: 10,
} as const;

export function toToolSteps(rows: ToolStepRow[], limit: number): PersistedStep[] {
  // Newest first throughout, then one reverse: rows come newest first, but a
  // row's calls are stored in call order, so they are walked backwards here.
  // Walking them forwards reversed the order inside a turn and made the
  // turn's FIRST call look like its newest.
  const steps: PersistedStep[] = [];
  for (const row of rows.slice(0, ROW_WINDOW.toolSteps)) {
    const calls = (Array.isArray(row.toolCalls) ? row.toolCalls : []) as PersistedStep[];
    for (const c of [...calls].reverse()) {
      if (c && typeof c === 'object' && typeof (c as PersistedStep).toolName === 'string') {
        steps.push(c);
      }
    }
    if (steps.length >= limit) break;
  }
  return steps.slice(0, limit).reverse();
}

export function toSources(rows: ToolStepRow[], limit: number): SearchResult[] {
  const collected: SearchResult[] = [];
  const seen = new Set<string>();
  for (const row of rows.slice(0, ROW_WINDOW.sources)) {
    const results = (Array.isArray(row.searchResults) ? row.searchResults : []) as SearchResult[];
    for (const r of results) {
      if (!r || typeof r !== 'object') continue;
      if (typeof r.content !== 'string' || r.content.trim() === '') continue;
      const key = `${r.url ?? ''}::${r.title ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      collected.push(r);
      if (collected.length >= limit) return collected;
    }
  }
  return collected;
}

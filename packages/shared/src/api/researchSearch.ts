import { getContractsClient } from './contractsClient.js';
import { ApiError } from './errors.js';

import type { ResearchSearchBody, ResearchSearchResponse } from '@gruenerator/contracts';

export type ResearchSearchMode = NonNullable<ResearchSearchBody['mode']>;
export type ResearchSortOption = NonNullable<ResearchSearchBody['sortBy']>;

export interface ResearchSearchParams {
  query: string;
  collectionIds?: string[];
  filters?: Record<string, unknown>;
  mode?: ResearchSearchMode;
  sortBy?: ResearchSortOption;
}

/** Shorter queries are still being typed — searching them only flickers. */
export const LIVE_SEARCH_MIN_LENGTH = 3;

/** A finished word is searched soon; a pause mid-word waits longer, so
 *  half-typed words don't fetch (and swap) hits of their own. */
export function liveSearchDelayMs(text: string): number {
  return /[\s.,;:!?]$/.test(text) ? 250 : 700;
}

/**
 * One research request, shared by web and mobile. With `notebookId` the
 * per-notebook route is the scope (ownership-checked; `collectionIds`/`filters`
 * are ignored there), otherwise the system-collection route — without
 * `collectionIds` that searches every searchable system collection.
 */
export async function fetchResearch(
  params: ResearchSearchParams,
  notebookId?: string
): Promise<ResearchSearchResponse> {
  const { query, collectionIds, filters, mode, sortBy } = params;
  const client = getContractsClient();
  const trimmed = query.trim();
  const result = notebookId
    ? await client.notebook.researchSearch({
        params: { id: notebookId },
        body: { query: trimmed, limit: null, mode: mode ?? null, sortBy: sortBy ?? null },
      })
    : await client.research.search({
        body: {
          query: trimmed,
          collectionIds: collectionIds?.length ? collectionIds : null,
          limit: null,
          filters: filters ?? null,
          mode: mode ?? null,
          sortBy: sortBy ?? null,
        },
      });
  if (result.status !== 200) {
    throw new ApiError(result.status, `Suche fehlgeschlagen (HTTP ${result.status})`);
  }
  return result.body;
}

/** Carries every input, so an answer for an older keystroke can never replace
 *  a newer one. */
export function liveResearchQueryKey(params: ResearchSearchParams, notebookId?: string) {
  return [
    'notebook-live-research',
    notebookId ?? params.collectionIds ?? null,
    params.query.trim(),
    params.filters ?? null,
    params.mode ?? null,
    params.sortBy ?? null,
  ] as const;
}

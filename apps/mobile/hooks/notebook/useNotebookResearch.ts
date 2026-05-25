import { getContractsClient, getGlobalApiClient } from '@gruenerator/shared/api';
import { useMutation } from '@tanstack/react-query';

import { getResearchCollectionIds } from '../../config/notebooksConfig';

export type SearchMode = 'hybrid' | 'vector' | 'text';
export type SortOption = 'relevance' | 'date_desc' | 'date_asc';

export interface ResearchResult {
  document_id: string;
  title: string;
  source_url: string | null;
  relevant_content: string;
  similarity_score: number;
  chunk_count?: number;
  top_chunks?: Array<{ preview: string; chunk_index: number; page_number: number | null }>;
  collection_id?: string | null;
  collection_name?: string | null;
  published_at?: string | null;
}

export interface ResearchMetadata {
  totalResults: number;
  collections: string[];
  timeMs: number;
}

export interface NotebookSearchInput {
  query: string;
  mode: SearchMode;
  sortBy: SortOption;
  /** Keyword/date facets, system notebooks only. */
  filters?: Record<string, unknown>;
}

interface ResearchResponse {
  results: ResearchResult[];
  metadata: ResearchMetadata | null;
}

/**
 * Per-notebook manual research. The backend keeps two disjoint research paths
 * (see notebooksConfig `NOTEBOOK_RESEARCH_COLLECTIONS`):
 *  - system notebooks → `/research/search`, scoped to the notebook's `*-system`
 *    collection ids, with full keyword/date facets (raw client; no contract exists).
 *  - user notebooks (UUIDs) → the contracted per-notebook endpoint, which accepts
 *    only query/mode/sortBy (no facets) and rejects system ids.
 */
export function useNotebookResearch(notebookId: string, kind: 'system' | 'user') {
  const mutation = useMutation<ResearchResponse, Error, NotebookSearchInput>({
    mutationKey: ['notebook', notebookId, 'research'],
    mutationFn: async (input) => {
      const query = input.query.trim();
      if (query.length < 2) return { results: [], metadata: null };

      if (kind === 'user') {
        const result = await getContractsClient().notebook.researchSearch({
          params: { id: notebookId },
          body: { query, mode: input.mode, sortBy: input.sortBy, limit: 30 },
        });
        if (result.status !== 200) {
          throw new Error('Suche fehlgeschlagen. Bitte erneut versuchen.');
        }
        return { results: result.body.results as ResearchResult[], metadata: result.body.metadata };
      }

      const body: Record<string, unknown> = { query, mode: input.mode, sortBy: input.sortBy };
      const collectionIds = getResearchCollectionIds(notebookId);
      if (collectionIds.length > 0) body.collectionIds = collectionIds;
      if (input.filters && Object.keys(input.filters).length > 0) body.filters = input.filters;

      const response = await getGlobalApiClient().post<ResearchResponse>('/research/search', body);
      return { results: response.data.results ?? [], metadata: response.data.metadata ?? null };
    },
  });

  return {
    search: mutation.mutate,
    results: mutation.data?.results ?? [],
    metadata: mutation.data?.metadata ?? null,
    isLoading: mutation.isPending,
    hasSearched: mutation.isSuccess || mutation.isError,
    error: mutation.error?.message ?? null,
  };
}

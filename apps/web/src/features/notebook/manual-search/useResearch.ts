import {
  type ResearchResult as ContractResearchResult,
  type ResearchSearchResponse,
} from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useState, useCallback } from 'react';

import { type SearchMode, type SortOption } from './useResearchFilters';

/** Single research hit — derived from the ts-rest research contract. */
export type ResearchResult = ContractResearchResult;

type ResearchMetadata = ResearchSearchResponse['metadata'];

export interface SearchParams {
  query: string;
  collectionIds?: string[];
  filters?: Record<string, unknown>;
  mode?: SearchMode;
  sortBy?: SortOption;
}

export interface UseResearchOptions {
  /**
   * When set, calls the per-notebook research-search contract route
   * (ownership-scoped chunk-level Qdrant search) instead of the
   * system-collection `/research/search` route. `collectionIds` and `filters`
   * in SearchParams are ignored in this mode — the notebook id is the scope.
   */
  notebookId?: string;
}

interface UseResearchReturn {
  results: ResearchResult[];
  metadata: ResearchMetadata | null;
  isLoading: boolean;
  error: string | null;
  search: (params: SearchParams) => Promise<void>;
  fetchSimilar: (sourceUrl: string, collectionId: string) => Promise<void>;
}

export function useResearch(opts: UseResearchOptions = {}): UseResearchReturn {
  const [results, setResults] = useState<ResearchResult[]>([]);
  const [metadata, setMetadata] = useState<ResearchMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const notebookId = opts.notebookId;

  const search = useCallback(
    async (params: SearchParams) => {
      const { query, collectionIds, filters, mode, sortBy } = params;
      if (!query || query.trim().length < 2) return;

      setIsLoading(true);
      setError(null);

      try {
        const client = getContractsClient();
        const trimmed = query.trim();

        if (notebookId) {
          const result = await client.notebook.researchSearch({
            params: { id: notebookId },
            body: {
              query: trimmed,
              limit: null,
              mode: mode ?? null,
              sortBy: sortBy ?? null,
            },
          });
          if (result.status !== 200) {
            throw new Error(`Suche fehlgeschlagen (HTTP ${result.status})`);
          }
          setResults(result.body.results);
          setMetadata(result.body.metadata);
        } else {
          const result = await client.research.search({
            body: {
              query: trimmed,
              collectionIds: collectionIds ?? null,
              limit: null,
              filters: filters ?? null,
              mode: mode ?? null,
              sortBy: sortBy ?? null,
            },
          });
          if (result.status !== 200) {
            throw new Error(`Suche fehlgeschlagen (HTTP ${result.status})`);
          }
          setResults(result.body.results);
          setMetadata(result.body.metadata);
        }
      } catch {
        setError('Suche fehlgeschlagen. Bitte erneut versuchen.');
        setResults([]);
        setMetadata(null);
      } finally {
        setIsLoading(false);
      }
    },
    [notebookId]
  );

  const fetchSimilar = useCallback(async (sourceUrl: string, collectionId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const client = getContractsClient();
      const result = await client.research.similar({
        body: { sourceUrl, collectionId, limit: null },
      });
      if (result.status !== 200) {
        throw new Error(`Ähnliche Dokumente konnten nicht geladen werden (HTTP ${result.status})`);
      }
      setResults(result.body.results);
      setMetadata(result.body.metadata);
    } catch {
      setError('Ähnliche Dokumente konnten nicht geladen werden.');
      setResults([]);
      setMetadata(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { results, metadata, isLoading, error, search, fetchSimilar };
}

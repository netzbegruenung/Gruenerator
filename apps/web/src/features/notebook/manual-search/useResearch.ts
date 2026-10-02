import {
  type ResearchResult as ContractResearchResult,
  type ResearchSearchResponse,
} from '@gruenerator/contracts';
import {
  ApiError,
  fetchResearch,
  getContractsClient,
  type ResearchSearchParams,
} from '@gruenerator/shared/api';
import { useState, useCallback } from 'react';

/** Single research hit — derived from the ts-rest research contract. */
export type ResearchResult = ContractResearchResult;

type ResearchMetadata = ResearchSearchResponse['metadata'];

export interface UseResearchOptions {
  /**
   * When set, calls the per-notebook research-search contract route
   * (ownership-scoped chunk-level Qdrant search) instead of the
   * system-collection `/research/search` route. `collectionIds` and `filters`
   * in the search params are ignored in this mode — the notebook id is the scope.
   */
  notebookId?: string;
}

interface UseResearchReturn {
  results: ResearchResult[];
  metadata: ResearchMetadata | null;
  isLoading: boolean;
  error: string | null;
  search: (params: ResearchSearchParams) => Promise<void>;
  fetchSimilar: (sourceUrl: string, collectionId: string) => Promise<void>;
}

export function useResearch(opts: UseResearchOptions = {}): UseResearchReturn {
  const [results, setResults] = useState<ResearchResult[]>([]);
  const [metadata, setMetadata] = useState<ResearchMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const notebookId = opts.notebookId;

  const search = useCallback(
    async (params: ResearchSearchParams) => {
      if (!params.query || params.query.trim().length < 2) return;

      setIsLoading(true);
      setError(null);

      try {
        const body = await fetchResearch(params, notebookId);
        setResults(body.results);
        setMetadata(body.metadata);
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
        throw new ApiError(
          result.status,
          `Ähnliche Dokumente konnten nicht geladen werden (HTTP ${result.status})`
        );
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

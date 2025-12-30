/**
 * useSearch Hook
 * Platform-agnostic hook for search functionality using the global API client.
 */

import { useState, useCallback } from 'react';
import { getGlobalApiClient } from '../../api/client';
import { useGeneratedTextStore } from '../../stores/generatedTextStore';
import { findUsedSources, formatAnalysisText } from '../utils/sourceUtils';
import type {
  SearchResult,
  WebSearchResponse,
  DeepSearchResponse,
  AnalysisResponse,
  SourceRecommendation,
  Citation,
  SourceReference,
  UseSearchReturn,
} from '../types';

const SEARCH_ENDPOINTS = {
  SEARCH: '/search',
  DEEP_RESEARCH: '/search/deep-research',
  WEB_SEARCH: '/web-search',
  ANALYZE: '/analyze',
} as const;

/**
 * Platform-agnostic hook for search functionality.
 *
 * Uses the global API client configured at app startup via setGlobalApiClient().
 * Supports three search modes: standard, deep research, and web search.
 *
 * @example
 * ```tsx
 * import { useSearch } from '@gruenerator/shared/search';
 *
 * function SearchScreen() {
 *   const {
 *     loading,
 *     error,
 *     webResults,
 *     dossier,
 *     webSearch,
 *     deepSearch,
 *   } = useSearch();
 *
 *   const handleSearch = async (query: string, mode: 'web' | 'deep') => {
 *     if (mode === 'deep') {
 *       await deepSearch(query);
 *     } else {
 *       await webSearch(query);
 *     }
 *   };
 *
 *   return (
 *     // ...
 *   );
 * }
 * ```
 */
export function useSearch(): UseSearchReturn {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [usedSources, setUsedSources] = useState<SearchResult[]>([]);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceRecommendations, setSourceRecommendations] = useState<SourceRecommendation[]>([]);
  const [loading, setLoading] = useState(false);

  const [dossier, setDossier] = useState<string | null>(null);
  const [categorizedSources, setCategorizedSources] = useState<Record<string, SearchResult[]>>({});
  const [researchQuestions, setResearchQuestions] = useState<string[]>([]);

  const [webResults, setWebResults] = useState<WebSearchResponse | null>(null);

  const [citations, setCitations] = useState<Citation[]>([]);
  const [citationSources, setCitationSources] = useState<SourceReference[]>([]);

  const setGeneratedTextMetadata = useGeneratedTextStore((state) => state.setGeneratedTextMetadata);

  const clearAllResults = useCallback(() => {
    setError(null);
    setAnalysis(null);
    setUsedSources([]);
    setSourceRecommendations([]);
    setResults([]);
    setDossier(null);
    setCategorizedSources({});
    setResearchQuestions([]);
    setWebResults(null);
    setCitations([]);
    setCitationSources([]);
  }, []);

  const search = useCallback(async (query: string) => {
    clearAllResults();
    setLoading(true);

    try {
      const client = getGlobalApiClient();

      const searchResponse = await client.post<{ status: string; results: SearchResult[] }>(
        SEARCH_ENDPOINTS.SEARCH,
        {
          query,
          options: {
            search_depth: 'advanced',
            max_results: 10,
            include_raw_content: true,
          },
        }
      );

      const searchData = searchResponse.data;

      if (searchData.status === 'success' && Array.isArray(searchData.results)) {
        setResults(searchData.results);

        try {
          const analysisResponse = await client.post<AnalysisResponse>(
            SEARCH_ENDPOINTS.ANALYZE,
            { contents: searchData.results.slice(0, 6) }
          );

          const analysisData = analysisResponse.data;
          setAnalysis(formatAnalysisText(analysisData.analysis));
          setSourceRecommendations(analysisData.sourceRecommendations || []);

          const usedSourcesList = findUsedSources(
            searchData.results.slice(0, 6),
            analysisData.analysis,
            analysisData.claudeSourceTitles || []
          );
          setUsedSources(usedSourcesList);
        } catch (analysisError) {
          console.error('Analyse fehlgeschlagen:', analysisError);
          setError('Die Analyse konnte nicht durchgeführt werden, aber hier sind die Suchergebnisse.');
        }
      } else {
        throw new Error('Ungültiges Antwortformat vom Server');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
      setError(message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [clearAllResults]);

  const deepSearch = useCallback(async (query: string) => {
    clearAllResults();
    setLoading(true);

    try {
      const client = getGlobalApiClient();

      const response = await client.post<DeepSearchResponse>(
        SEARCH_ENDPOINTS.DEEP_RESEARCH,
        { query }
      );

      const deepSearchData = response.data;

      if (deepSearchData.status === 'success') {
        setDossier(deepSearchData.dossier);
        setCategorizedSources(deepSearchData.categorizedSources || {});
        setResearchQuestions(deepSearchData.researchQuestions || []);
        setResults(deepSearchData.sources || []);

        if (deepSearchData.citations) {
          setCitations(deepSearchData.citations);
          setGeneratedTextMetadata('deep-research-dossier', {
            citations: deepSearchData.citations.map((c) => ({
              index: c.sourceIndex,
              url: '',
              title: '',
            })),
          });
        }
        if (deepSearchData.citationSources) {
          setCitationSources(deepSearchData.citationSources);
        }
      } else {
        throw new Error('Ungültiges Antwortformat vom Server');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
      console.error('[useSearch] Deep search error:', err);
      setError(message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [clearAllResults, setGeneratedTextMetadata]);

  const webSearch = useCallback(async (query: string) => {
    clearAllResults();
    setLoading(true);

    try {
      const client = getGlobalApiClient();

      const response = await client.post<WebSearchResponse>(
        SEARCH_ENDPOINTS.WEB_SEARCH,
        {
          query,
          searchType: 'general',
          includeSummary: true,
          maxResults: 10,
          language: 'de-DE',
        }
      );

      const webSearchData = response.data;

      if (webSearchData.success) {
        setWebResults(webSearchData);

        if (webSearchData.citations) {
          setCitations(webSearchData.citations);
          setGeneratedTextMetadata('web-search-summary', {
            citations: webSearchData.citations.map((c) => ({
              index: c.sourceIndex,
              url: '',
              title: '',
            })),
          });
        }
        if (webSearchData.sources) {
          setCitationSources(webSearchData.sources);
        }
      } else {
        throw new Error('Web search failed');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
      console.error('[useSearch] Web search error:', err);
      setError(message);
      setWebResults(null);
    } finally {
      setLoading(false);
    }
  }, [clearAllResults, setGeneratedTextMetadata]);

  return {
    results,
    usedSources,
    analysis,
    loading,
    error,
    search,
    deepSearch,
    webSearch,
    sourceRecommendations,
    dossier,
    categorizedSources,
    researchQuestions,
    webResults,
    citations,
    citationSources,
    clearAllResults,
  };
}

export default useSearch;

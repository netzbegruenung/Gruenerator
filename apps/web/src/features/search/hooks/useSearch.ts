import { useState, useCallback } from 'react';

import useApiSubmit from '../../../components/hooks/useApiSubmit';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';

interface Source {
  url: string;
  title?: string;
  content_snippets?: string;
}

const findUsedSources = (
  sources: Source[],
  analysisText: string,
  claudeSourceTitles: string[]
): Source[] => {
  // Extrahiere URLs und Titel aus der Analyse
  const urlRegex = /(https?:\/\/[^\s)]+)/g;
  const usedUrls = [...new Set(analysisText.match(urlRegex) || [])];

  // Finde Quellen, die entweder durch URL, Titel oder von Claude genannt wurden
  return sources.filter((source) => {
    // URL-Match
    const urlMatch = usedUrls.some((url) => source.url.includes(url) || url.includes(source.url));

    // Titel-Match (berücksichtigt auch Teilübereinstimmungen)
    const title = source.title;
    const titleMatch =
      title &&
      (analysisText
        .toLowerCase()
        .includes(title.toLowerCase().substring(0, Math.min(title.length, 40))) ||
        claudeSourceTitles.some(
          (claudeTitle) =>
            claudeTitle.toLowerCase().includes(title.toLowerCase()) ||
            title.toLowerCase().includes(claudeTitle.toLowerCase())
        ));

    return urlMatch || titleMatch;
  });
};

const formatAnalysisText = (text: string): string => {
  // Teile den Text in Absätze
  const paragraphs = text.split('\n\n');

  // Füge Absätze nur für Text ohne HTML-Tags hinzu
  return paragraphs
    .map((paragraph) => {
      // Wenn der Paragraph bereits HTML-Tags enthält, gib ihn unverändert zurück
      if (paragraph.includes('<')) {
        return paragraph;
      }
      // Ansonsten wickle ihn in p-Tags
      return `<p>${paragraph}</p>`;
    })
    .join('');
};

interface Citation {
  id: string;
  sourceId: string;
  text: string;
}

interface WebResults {
  summary?: { text: string };
  results?: Array<{ url: string; title: string; snippet?: string }>;
  suggestions?: string[];
  resultCount?: number;
}

interface SourceRecommendation {
  title: string;
  summary: string;
}

interface SearchApiResponse {
  status: string;
  results?: Source[];
}

interface AnalysisApiResponse {
  analysis: string;
  sourceRecommendations?: SourceRecommendation[];
  claudeSourceTitles: string[];
}

interface DeepSearchApiResponse {
  status: string;
  dossier?: string;
  categorizedSources?: Record<string, Source[]>;
  researchQuestions?: string[];
  sources?: Source[];
  citations?: Citation[];
  citationSources?: Source[];
}

interface WebSearchApiResponse {
  success: boolean;
  error?: string;
  citations?: Citation[];
  sources?: Source[];
}

const useSearch = () => {
  const [results, setResults] = useState<Source[]>([]);
  const [usedSources, setUsedSources] = useState<Source[]>([]);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceRecommendations, setSourceRecommendations] = useState<SourceRecommendation[]>([]);

  // Deep research specific state
  const [dossier, setDossier] = useState<string | null>(null);
  const [categorizedSources, setCategorizedSources] = useState<Record<string, Source[]>>({});
  const [researchQuestions, setResearchQuestions] = useState<string[]>([]);

  // Web search specific state
  const [webResults, setWebResults] = useState<WebResults | null>(null);

  // Citation support
  const [citations, setCitations] = useState<Citation[]>([]);
  const [citationSources, setCitationSources] = useState<Source[]>([]);

  // Get store function to save citations for ContentRenderer
  const setGeneratedTextMetadata = useGeneratedTextStore((state) => state.setGeneratedTextMetadata);

  const { submitForm: submitSearch, loading: searchLoading } = useApiSubmit('search');
  const { submitForm: submitAnalysis, loading: analysisLoading } = useApiSubmit('analyze');
  const { submitForm: submitDeepSearch, loading: deepSearchLoading } =
    useApiSubmit('search/deep-research');
  const { submitForm: submitWebSearch, loading: webSearchLoading } = useApiSubmit('web-search');

  const clearAllResults = () => {
    setError(null);
    setAnalysis(null);
    setUsedSources([]);
    setSourceRecommendations([]);
    setResults([]);
    // Clear deep research results
    setDossier(null);
    setCategorizedSources({});
    setResearchQuestions([]);
    // Clear web search results
    setWebResults(null);
    // Clear citations
    setCitations([]);
    setCitationSources([]);
  };

  const search = useCallback(
    async (query: string) => {
      clearAllResults();

      try {
        const searchData = (await submitSearch({
          query,
          options: {
            search_depth: 'advanced',
            max_results: 10,
            include_raw_content: true,
          },
        })) as unknown as SearchApiResponse;

        if (searchData.status === 'success' && Array.isArray(searchData.results)) {
          setResults(searchData.results);

          try {
            const analysisResult = (await submitAnalysis({
              contents: searchData.results.slice(0, 6),
            })) as unknown as AnalysisApiResponse;
            setAnalysis(formatAnalysisText(analysisResult.analysis));
            setSourceRecommendations(analysisResult.sourceRecommendations || []);

            const usedSourcesList = findUsedSources(
              searchData.results.slice(0, 6),
              analysisResult.analysis,
              analysisResult.claudeSourceTitles
            );
            setUsedSources(usedSourcesList);
          } catch (analysisError) {
            console.error('Analyse fehlgeschlagen:', analysisError);
            setError(
              'Die Analyse konnte nicht durchgeführt werden, aber hier sind die Suchergebnisse.'
            );
          }
        } else {
          throw new Error('Ungültiges Antwortformat vom Server');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setResults([]);
      }
    },
    [submitSearch, submitAnalysis]
  );

  const deepSearch = useCallback(
    async (query: string) => {
      clearAllResults();

      try {
        console.log('[useSearch] Starting deep search for:', query);

        const deepSearchData = (await submitDeepSearch({
          query,
        })) as unknown as DeepSearchApiResponse;

        if (deepSearchData.status === 'success') {
          console.log('[useSearch] Deep search successful:', deepSearchData);

          setDossier(deepSearchData.dossier ?? null);
          setCategorizedSources(deepSearchData.categorizedSources || {});
          setResearchQuestions(deepSearchData.researchQuestions || []);
          setResults(deepSearchData.sources || []);

          if (deepSearchData.citations) {
            setCitations(deepSearchData.citations);
            setGeneratedTextMetadata('deep-research-dossier', {
              citations: deepSearchData.citations,
              citationSources: deepSearchData.citationSources || [],
            });
          }
          if (deepSearchData.citationSources) {
            setCitationSources(deepSearchData.citationSources);
          }
        } else {
          throw new Error('Ungültiges Antwortformat vom Server');
        }
      } catch (err) {
        console.error('[useSearch] Deep search error:', err);
        setError(err instanceof Error ? err.message : String(err));
        setResults([]);
      }
    },
    [submitDeepSearch, setGeneratedTextMetadata]
  );

  const webSearch = useCallback(
    async (query: string) => {
      clearAllResults();

      try {
        console.log('[useSearch] Starting web search for:', query);

        const webSearchData = (await submitWebSearch({
          query,
          searchType: 'general',
          includeSummary: true,
          maxResults: 10,
          language: 'de-DE',
        })) as unknown as WebSearchApiResponse & WebResults;

        if (webSearchData.success) {
          console.log('[useSearch] Web search successful:', webSearchData);
          setWebResults(webSearchData);

          if (webSearchData.citations) {
            setCitations(webSearchData.citations);
            setGeneratedTextMetadata('web-search-summary', {
              citations: webSearchData.citations,
              citationSources: webSearchData.sources || [],
            });
          }
          if (webSearchData.sources) {
            setCitationSources(webSearchData.sources);
          }
        } else {
          throw new Error(webSearchData.error || 'Web search failed');
        }
      } catch (err) {
        console.error('[useSearch] Web search error:', err);
        setError(err instanceof Error ? err.message : String(err));
        setWebResults(null);
      }
    },
    [submitWebSearch, setGeneratedTextMetadata]
  );

  return {
    results,
    usedSources,
    analysis,
    loading: searchLoading || analysisLoading || deepSearchLoading || webSearchLoading,
    error,
    search,
    deepSearch,
    webSearch,
    sourceRecommendations,
    // Deep research specific returns
    dossier,
    categorizedSources,
    researchQuestions,
    // Web search specific returns
    webResults,
    // Citation support
    citations,
    citationSources,
  };
};

export default useSearch;

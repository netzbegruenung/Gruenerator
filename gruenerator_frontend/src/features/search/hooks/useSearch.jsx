import { useState, useCallback } from 'react';
import useApiSubmit from '../../../components/hooks/useApiSubmit';

const findUsedSources = (sources, analysisText, claudeSourceTitles) => {
  // Extrahiere URLs und Titel aus der Analyse
  const urlRegex = /(https?:\/\/[^\s)]+)/g;
  const usedUrls = [...new Set(analysisText.match(urlRegex) || [])];
  
  // Finde Quellen, die entweder durch URL, Titel oder von Claude genannt wurden
  return sources.filter(source => {
    // URL-Match
    const urlMatch = usedUrls.some(url => 
      source.url.includes(url) || url.includes(source.url)
    );
    
    // Titel-Match (berücksichtigt auch Teilübereinstimmungen)
    const titleMatch = source.title && (
      analysisText.toLowerCase().includes(
        source.title.toLowerCase().substring(0, Math.min(source.title.length, 40))
      ) ||
      claudeSourceTitles.some(claudeTitle => 
        claudeTitle.toLowerCase().includes(source.title.toLowerCase()) ||
        source.title.toLowerCase().includes(claudeTitle.toLowerCase())
      )
    );
    
    return urlMatch || titleMatch;
  });
};

const formatAnalysisText = (text) => {
  // Teile den Text in Absätze
  const paragraphs = text.split('\n\n');
  
  // Füge Absätze nur für Text ohne HTML-Tags hinzu
  return paragraphs.map(paragraph => {
    // Wenn der Paragraph bereits HTML-Tags enthält, gib ihn unverändert zurück
    if (paragraph.includes('<')) {
      return paragraph;
    }
    // Ansonsten wickle ihn in p-Tags
    return `<p>${paragraph}</p>`;
  }).join('');
};

const useSearch = () => {
  const [results, setResults] = useState([]);
  const [usedSources, setUsedSources] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState(null);
  const [sourceRecommendations, setSourceRecommendations] = useState([]);
  
  // Deep research specific state
  const [dossier, setDossier] = useState(null);
  const [categorizedSources, setCategorizedSources] = useState({});
  const [researchQuestions, setResearchQuestions] = useState([]);
  
  // Web search specific state
  const [webResults, setWebResults] = useState(null);
  
  const { submitForm: submitSearch, loading: searchLoading } = useApiSubmit('search');
  const { submitForm: submitAnalysis, loading: analysisLoading } = useApiSubmit('analyze');
  const { submitForm: submitDeepSearch, loading: deepSearchLoading } = useApiSubmit('search/deep-research');
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
  };

  const search = useCallback(async (query) => {
    clearAllResults();

    try {
      // 1. Tavily Suche (10 Ergebnisse)
      const searchData = await submitSearch({
        query,
        options: {
          search_depth: 'advanced',
          max_results: 10,
          include_raw_content: true
        }
      });
      
      if (searchData.status === 'success' && Array.isArray(searchData.results)) {
        setResults(searchData.results);
        
        // 2. Claude Analyse (nur die ersten 6 Quellen)
        try {
          const analysisResult = await submitAnalysis({ 
            contents: searchData.results.slice(0, 6) 
          });
          setAnalysis(formatAnalysisText(analysisResult.analysis));
          setSourceRecommendations(analysisResult.sourceRecommendations || []);
          
          // 3. Finde genutzte Quellen (nur aus den ersten 6)
          const usedSourcesList = findUsedSources(
            searchData.results.slice(0, 6), 
            analysisResult.analysis,
            analysisResult.claudeSourceTitles
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
      setError(err.message);
      setResults([]);
    }
  }, [submitSearch, submitAnalysis]);

  const deepSearch = useCallback(async (query) => {
    clearAllResults();

    try {
      console.log('[useSearch] Starting deep search for:', query);
      
      const deepSearchData = await submitDeepSearch({ query });
      
      if (deepSearchData.status === 'success') {
        console.log('[useSearch] Deep search successful:', deepSearchData);
        
        // Set deep research specific data
        setDossier(deepSearchData.dossier);
        setCategorizedSources(deepSearchData.categorizedSources || {});
        setResearchQuestions(deepSearchData.researchQuestions || []);
        
        // Set general sources data for potential use
        setResults(deepSearchData.sources || []);
        
        // For deep search, we don't use the standard analysis workflow
        // The dossier serves as the analysis
        
      } else {
        throw new Error('Ungültiges Antwortformat vom Server');
      }
    } catch (err) {
      console.error('[useSearch] Deep search error:', err);
      setError(err.message);
      setResults([]);
    }
  }, [submitDeepSearch]);

  const webSearch = useCallback(async (query) => {
    clearAllResults();

    try {
      console.log('[useSearch] Starting web search for:', query);
      
      const webSearchData = await submitWebSearch({
        query,
        searchType: 'general',
        includeSummary: true,
        maxResults: 10,
        language: 'de-DE'
      });
      
      if (webSearchData.success) {
        console.log('[useSearch] Web search successful:', webSearchData);
        setWebResults(webSearchData);
      } else {
        throw new Error(webSearchData.error || 'Web search failed');
      }
    } catch (err) {
      console.error('[useSearch] Web search error:', err);
      setError(err.message);
      setWebResults(null);
    }
  }, [submitWebSearch]);

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
    webResults
  };
};

export default useSearch; 
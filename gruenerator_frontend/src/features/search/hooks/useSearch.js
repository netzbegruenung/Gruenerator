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
  
  const { submitForm: submitSearch, loading: searchLoading } = useApiSubmit('search');
  const { submitForm: submitAnalysis, loading: analysisLoading } = useApiSubmit('analyze');

  const search = useCallback(async (query) => {
    setError(null);
    setAnalysis(null);
    setUsedSources([]);
    setSourceRecommendations([]);

    try {
      // 1. Tavily Suche (10 Ergebnisse)
      const searchData = await submitSearch({
        query,
        options: {
          search_depth: 'advanced',
          max_results: 10
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

  return {
    results,
    usedSources,
    analysis,
    loading: searchLoading || analysisLoading,
    error,
    search,
    sourceRecommendations
  };
};

export default useSearch; 
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
  
  return paragraphs.map(paragraph => {
    // Wenn der Absatz mit "- " beginnt, ist es eine Liste
    if (paragraph.trim().split('\n').some(line => line.trim().startsWith('- '))) {
      const items = paragraph
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
      
      // Erstelle eine HTML-Liste
      const listItems = items.map(item => {
        if (item.startsWith('- ')) {
          return `<li>${item.substring(2)}</li>`;
        }
        return `<p>${item}</p>`;
      }).join('');

      return `<ul>${listItems}</ul>`;
    }
    
    // Normaler Absatz
    return `<p>${paragraph}</p>`;
  }).join('');
};

const useSearch = () => {
  const [results, setResults] = useState([]);
  const [usedSources, setUsedSources] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState(null);
  
  const { submitForm: submitSearch, loading: searchLoading } = useApiSubmit('search');
  const { submitForm: submitAnalysis, loading: analysisLoading } = useApiSubmit('analyze');

  const search = useCallback(async (query) => {
    setError(null);
    setAnalysis(null);
    setUsedSources([]);

    try {
      // 1. Tavily Suche
      const searchData = await submitSearch({
        query,
        options: {
          search_depth: 'advanced',
          max_results: 10
        }
      });
      
      if (searchData.status === 'success' && Array.isArray(searchData.results)) {
        setResults(searchData.results);
        
        // 2. Claude Analyse
        try {
          const analysisResult = await submitAnalysis({ contents: searchData.results });
          setAnalysis(formatAnalysisText(analysisResult.analysis));
          
          // 3. Finde genutzte Quellen
          const usedSourcesList = findUsedSources(
            searchData.results, 
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
    search
  };
};

export default useSearch; 
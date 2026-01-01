import React, { useState, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
import { FaFileWord } from 'react-icons/fa';
import SearchBar from './SearchBar';
import useSearch from '../hooks/useSearch';
import ActionButtons from '../../../components/common/ActionButtons';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { formatExportContent } from '../../../components/utils/exportUtils';
import ContentRenderer from '../../../components/common/Form/BaseForm/ContentRenderer';
import { CitationModal, CitationSourcesDisplay } from '../../../components/common/Citation';
import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import { useExportStore } from '../../../stores/core/exportStore';

// Search Feature CSS - Loaded only when this feature is accessed
import '../styles/SearchPage.css';
import '../styles/SearchResults.css';
import '../styles/SearchBarStyles.css';

const exampleQuestions = [
  {
    icon: '🌍',
    text: 'Was macht die Grüne Fraktion für den Klimaschutz?'
  },
  {
    icon: '🏘️',
    text: 'Grüne Position zum Mietendeckel'
  },
  {
    icon: '🚲',
    text: 'Fahrradinfrastruktur in Deutschland'
  }
];

const ExampleQuestions = ({ onQuestionClick }) => (
  <div className="example-questions">
    {exampleQuestions.map((question, index) => (
      <button
        key={index}
        className="example-question"
        onClick={() => onQuestionClick(question.text)}
      >
        <span>{question.icon}</span>
        <span>{question.text}</span>
      </button>
    ))}
  </div>
);

ExampleQuestions.propTypes = {
  onQuestionClick: PropTypes.func.isRequired
};

const extractMainDomain = (url) => {
  try {
    const domain = new URL(url).hostname;
    return domain.replace(/^www\./, '');
  } catch {
    return url;
  }
};

const SourceList = ({ sources, title, recommendations = [] }) => (
  <div className="sources-container">
    <h2>{title}</h2>
    <div className="sources-list">
      {sources.map((source, index) => {
        const recommendation = recommendations.find(r => r.title === source.title);
        const hasSnippets = source.content_snippets && source.content_snippets.trim().length > 0;
        
        return (
          <a 
            key={index} 
            href={source.url} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="source-item"
          >
            <h3>{source.title}</h3>
            {recommendation && (
              <div className="source-recommendation">
                <p className="source-summary">{recommendation.summary}</p>
              </div>
            )}
            {hasSnippets && (
              <div className="source-content-snippets">
                <p className="content-preview">
                  {source.content_snippets.length > 200 
                    ? `${source.content_snippets.substring(0, 200)}...` 
                    : source.content_snippets
                  }
                </p>
              </div>
            )}
            <span className="source-url">{extractMainDomain(source.url)}</span>
          </a>
        );
      })}
    </div>
  </div>
);

SourceList.propTypes = {
  sources: PropTypes.arrayOf(
    PropTypes.shape({
      url: PropTypes.string.isRequired,
      title: PropTypes.string.isRequired
    })
  ).isRequired,
  title: PropTypes.string.isRequired,
  recommendations: PropTypes.arrayOf(
    PropTypes.shape({
      title: PropTypes.string.isRequired,
      summary: PropTypes.string.isRequired
    })
  )
};

const SearchPage = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState('web');
  const generateNotebookDOCX = useExportStore((state) => state.generateNotebookDOCX);
  const {
    results,
    usedSources,
    analysis,
    loading,
    error,
    search,
    deepSearch,
    webSearch,
    webResults,
    dossier,
    categorizedSources,
    sourceRecommendations = [],
    citations = [],
    citationSources = []
  } = useSearch();

  const hasCitations = citations.length > 0;

  const handleWebSearchDOCXExport = useCallback(async () => {
    if (!hasCitations || !webResults?.summary?.text) return;
    await generateNotebookDOCX(
      webResults.summary.text,
      'Web-Suche Zusammenfassung',
      citations,
      citationSources
    );
  }, [hasCitations, webResults, citations, citationSources, generateNotebookDOCX]);

  const handleDeepResearchDOCXExport = useCallback(async () => {
    if (!hasCitations || !dossier) return;
    await generateNotebookDOCX(
      dossier,
      'Recherche-Dossier',
      citations,
      citationSources
    );
  }, [hasCitations, dossier, citations, citationSources, generateNotebookDOCX]);

  const webSearchExportOptions = useMemo(() => {
    if (!hasCitations) return [];
    return [{
      id: 'web-search-docx',
      label: 'Word mit Quellen',
      subtitle: 'Inkl. Quellenangaben',
      icon: <FaFileWord size={16} />,
      onClick: handleWebSearchDOCXExport
    }];
  }, [hasCitations, handleWebSearchDOCXExport]);

  const deepResearchExportOptions = useMemo(() => {
    if (!hasCitations) return [];
    return [{
      id: 'deep-research-docx',
      label: 'Word mit Quellen',
      subtitle: 'Inkl. Quellenangaben',
      icon: <FaFileWord size={16} />,
      onClick: handleDeepResearchDOCXExport
    }];
  }, [hasCitations, handleDeepResearchDOCXExport]);

  const handleSearch = async (query) => {
    if (searchMode === 'deep') {
      await deepSearch(query);
    } else {
      await webSearch(query);
    }
  };

  const toggleDeepResearch = () => {
    setSearchMode(prev => prev === 'deep' ? 'web' : 'deep');
  };

  // Berechne die nicht verwendeten Quellen
  const unusedSources = results.filter(
    result => !usedSources.some(used => used.url === result.url)
  );

  return (
    <ErrorBoundary>
      <CitationModal />
      <div className="search-page-container">
        <div className="search-header">
          <h1>Grünerator Suche</h1>
          <p className="search-subtitle">KI-Suche des Grünerators</p>
        </div>
        
        <SearchBar
          onSearch={handleSearch}
          loading={loading}
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder={
            searchMode === 'deep'
              ? 'Thema für umfassende Recherche eingeben...'
              : 'Web-Suchbegriff eingeben...'
          }
          onDeepResearchToggle={toggleDeepResearch}
          isDeepResearchActive={searchMode === 'deep'}
        />
        
        {loading && searchMode === 'deep' && (
          <div className="deep-search-progress">
            <p>🔍 Führe umfassende Recherche durch...</p>
            <p>📋 Generiere Forschungsfragen und sammle Quellen...</p>
          </div>
        )}
        
        
        {error && (
          <div className="search-error">
            {error}
          </div>
        )}

        {/* Web Search Results */}
        {webResults && searchMode === 'web' && (
          <div className="web-search-container">
            {webResults.summary && (
              <div className="analysis-container">
                <div className="analysis-actions">
                  <ActionButtons
                    content={webResults.summary.text}
                    onEdit={() => {}}
                    isEditing={false}
                    allowEditing={false}
                    hideEditButton={true}
                    showExport={true}
                    customExportOptions={webSearchExportOptions}
                  />
                </div>
                <div className="analysis-content">
                  <h2>🤖 AI-Zusammenfassung</h2>
                  <ContentRenderer
                    value={webResults.summary.text}
                    useMarkdown={true}
                    componentName="web-search-summary"
                  />
                </div>

                {/* Display citations for web search summary */}
                {searchMode === 'web' && citations.length > 0 && (
                  <div className="citation-sources-section">
                    <CitationSourcesDisplay
                      sources={citationSources}
                      citations={citations}
                      linkConfig={{ type: 'none' }}
                      title="🔗 Quellen der Zusammenfassung"
                      className="search-citation-sources"
                    />
                  </div>
                )}
              </div>
            )}
            
            <div className="web-search-results">
              {webResults.results && webResults.results.length > 0 && (
                <div className="sources-section">
                  <SourceList 
                    sources={webResults.results.map(result => ({
                      url: result.url,
                      title: result.title,
                      content_snippets: result.snippet || ''
                    }))}
                    title={`🌐 Web-Suchergebnisse (${webResults.resultCount})`}
                  />
                </div>
              )}
              
              {webResults.suggestions && webResults.suggestions.length > 0 && (
                <div className="web-search-suggestions">
                  <h3>💡 Suchvorschläge</h3>
                  <div className="suggestions-list">
                    {webResults.suggestions.map((suggestion, index) => (
                      <button 
                        key={index}
                        className="suggestion-item"
                        onClick={() => handleSearch(suggestion)}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Deep Research Results */}
        {dossier && searchMode === 'deep' && (
          <>
            <div className="dossier-container">
              <div className="analysis-actions">
                <ActionButtons
                  content={dossier}
                  onEdit={() => {}}
                  isEditing={false}
                  allowEditing={false}
                  hideEditButton={true}
                  showExport={true}
                  customExportOptions={deepResearchExportOptions}
                />
              </div>
              <div className="dossier-content">
                <ContentRenderer
                  value={dossier}
                  useMarkdown={true}
                  componentName="deep-research-dossier"
                />
              </div>

              {/* Display citations for deep research dossier */}
              {searchMode === 'deep' && citations.length > 0 && (
                <div className="citation-sources-section">
                  <CitationSourcesDisplay
                    sources={citationSources}
                    citations={citations}
                    linkConfig={{ type: 'none' }}
                    title="🔗 Quellen des Dossiers"
                    className="search-citation-sources"
                  />
                </div>
              )}
            </div>
            
            {categorizedSources && Object.keys(categorizedSources).length > 0 && (
              <div className="categorized-sources-section">
                <h2>Quellen nach Themenbereichen</h2>
                {Object.entries(categorizedSources).map(([category, sources]) => (
                  <SourceList 
                    key={category}
                    sources={sources} 
                    title={category}
                    recommendations={sourceRecommendations}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Standard Search Results */}
        {analysis && searchMode === 'standard' && (
          <>
            <div className="analysis-container">
              <div className="analysis-actions">
                <ActionButtons
                  content={formatExportContent({
                    analysis,
                    sourceRecommendations,
                    unusedSources: results
                  })}
                  onEdit={() => {}}
                  isEditing={false}
                  allowEditing={false}
                  hideEditButton={true}
                  showExport={true}
                />
              </div>
              <div className="analysis-content" dangerouslySetInnerHTML={{ __html: analysis }} />
            </div>
            
            <div className="sources-section">
              {usedSources.length > 0 && (
                <SourceList 
                  sources={usedSources} 
                  title="Verwendete Quellen"
                  recommendations={sourceRecommendations}
                />
              )}

              {unusedSources.length > 0 && (
                <SourceList 
                  sources={unusedSources} 
                  title="Ergänzende Informationen"
                  recommendations={sourceRecommendations}
                />
              )}
            </div>
          </>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default withAuthRequired(SearchPage, {
  title: 'Suche',
  message: 'Melde dich an, um die Suche zu nutzen.'
}); 
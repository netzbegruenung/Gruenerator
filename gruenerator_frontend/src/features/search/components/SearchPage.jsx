import React, { useState } from 'react';
import PropTypes from 'prop-types';
import SearchBar from './SearchBar';
import useSearch from '../hooks/useSearch';
import ActionButtons from '../../../components/common/ActionButtons';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { formatExportContent } from '../../../components/utils/exportUtils';
import ContentRenderer from '../../../components/common/Form/BaseForm/ContentRenderer';

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
  const [searchMode, setSearchMode] = useState('standard'); // 'standard' or 'deep'
  const { 
    results,
    usedSources, 
    analysis,
    loading, 
    error, 
    search,
    deepSearch,
    dossier,
    categorizedSources,
    sourceRecommendations = []
  } = useSearch();

  const handleSearch = async (query) => {
    if (searchMode === 'deep') {
      await deepSearch(query);
    } else {
      await search(query);
    }
  };

  // Berechne die nicht verwendeten Quellen
  const unusedSources = results.filter(
    result => !usedSources.some(used => used.url === result.url)
  );

  return (
    <ErrorBoundary>
      <div className="search-page-container">
        <div className="search-header">
          <h1>Grünerator Suche</h1>
          <p className="search-subtitle">KI-Suche des Grünerators</p>
        </div>
        
        <div className="search-mode-selector">
          <div className="mode-options">
            <label className="mode-option">
              <input
                type="radio"
                value="standard"
                checked={searchMode === 'standard'}
                onChange={(e) => setSearchMode(e.target.value)}
              />
              <span>Standard-Suche</span>
              <small>Schnelle Suche mit sofortigen Ergebnissen</small>
            </label>
            <label className="mode-option">
              <input
                type="radio"
                value="deep"
                checked={searchMode === 'deep'}
                onChange={(e) => setSearchMode(e.target.value)}
              />
              <span>Deep Research</span>
              <small>Umfassende Recherche mit strukturiertem Dossier</small>
            </label>
          </div>
        </div>
        
        <SearchBar 
          onSearch={handleSearch} 
          loading={loading} 
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder={searchMode === 'deep' ? 
            'Thema für umfassende Recherche eingeben...' : 
            'Suchbegriff eingeben...'
          }
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
                />
              </div>
              <div className="dossier-content">
                <ContentRenderer
                  value={dossier}
                  useMarkdown={true}
                  componentName="deep-research-dossier"
                />
              </div>
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

export default SearchPage; 
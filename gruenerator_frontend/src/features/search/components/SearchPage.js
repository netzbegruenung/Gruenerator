import React, { useState } from 'react';
import PropTypes from 'prop-types';
import SearchBar from './SearchBar';
import useSearch from '../hooks/useSearch';
import '../styles/SearchPage.css';
import VerifyFeature from '../../../components/common/VerifyFeature';
import ActionButtons from '../../../components/common/ActionButtons';
import { formatExportContent } from '../../../utils/exportUtils';

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
  const { 
    results,
    usedSources, 
    analysis,
    loading, 
    error, 
    search,
    sourceRecommendations = []
  } = useSearch();

  const handleSearch = async (query) => {
    await search(query);
  };

  // Berechne die nicht verwendeten Quellen
  const unusedSources = results.filter(
    result => !usedSources.some(used => used.url === result.url)
  );

  return (
    <VerifyFeature feature="search">
      <div className="search-page-container">
        <div className="search-header">
          <h1>Gruugo</h1>
          <p className="search-subtitle">KI-Suche des Grünerators</p>
        </div>
        
        <SearchBar 
          onSearch={handleSearch} 
          loading={loading} 
          value={searchQuery}
          onChange={setSearchQuery}
        />
        
        {error && (
          <div className="search-error">
            {error}
          </div>
        )}

        {analysis && (
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
    </VerifyFeature>
  );
};

export default SearchPage; 
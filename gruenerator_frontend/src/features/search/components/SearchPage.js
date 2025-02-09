import React from 'react';
import PropTypes from 'prop-types';
import SearchBar from './SearchBar';
import useSearch from '../hooks/useSearch';
import '../styles/SearchPage.css';
import VerifyFeature from '../../../components/common/VerifyFeature';

const SourceList = ({ sources, title }) => (
  <div className="sources-container">
    <h2>{title}</h2>
    <div className="sources-list">
      {sources.map((source, index) => (
        <a 
          key={index} 
          href={source.url} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="source-item"
        >
          <h3>{source.title}</h3>
          <span className="source-url">{source.url}</span>
        </a>
      ))}
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
  title: PropTypes.string.isRequired
};

const SearchPage = () => {
  const { 
    results,
    usedSources, 
    analysis,
    loading, 
    error, 
    search
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
          <h1>Gruugle</h1>
          <p className="search-subtitle">Grünerator KI-Suche</p>
        </div>
        
        <SearchBar onSearch={handleSearch} loading={loading} />
        
        {error && (
          <div className="search-error">
            {error}
          </div>
        )}

        {analysis && (
          <>
            <div className="analysis-container">
              <h2>Zusammenfassung</h2>
              <div className="analysis-content" dangerouslySetInnerHTML={{ __html: analysis }} />
            </div>
            
            <div className="sources-section">
              {usedSources.length > 0 && (
                <SourceList 
                  sources={usedSources} 
                  title="Verwendete Quellen"
                />
              )}

              {unusedSources.length > 0 && (
                <SourceList 
                  sources={unusedSources} 
                  title="Ergänzende Informationen"
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
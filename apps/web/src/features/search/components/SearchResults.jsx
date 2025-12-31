import React from 'react';
import PropTypes from 'prop-types';
const SearchResults = ({ results, loading }) => {
  if (loading) {
    return (
      <div className="search-results-loading">
        <div className="loading-spinner"></div>
        <p>Suche läuft...</p>
      </div>
    );
  }

  if (!results?.length) {
    return null;
  }

  return (
    <div className="search-results-container">
      <div className="results-count">
        Etwa {results.length} Ergebnisse
      </div>
      <div className="search-results-list">
        {results.map((result, index) => (
          <div key={index} className="search-result-item">
            <a href={result.url} target="_blank" rel="noopener noreferrer" className="result-url">
              {result.url}
            </a>
            <a href={result.url} target="_blank" rel="noopener noreferrer" className="result-title">
              {result.title}
            </a>
            <p className="result-content">{result.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

SearchResults.propTypes = {
  results: PropTypes.arrayOf(
    PropTypes.shape({
      url: PropTypes.string.isRequired,
      title: PropTypes.string.isRequired,
      content: PropTypes.string.isRequired
    })
  ),
  loading: PropTypes.bool
};

SearchResults.defaultProps = {
  results: [],
  loading: false
};

export default SearchResults; 
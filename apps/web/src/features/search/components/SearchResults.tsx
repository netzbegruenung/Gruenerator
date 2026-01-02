import type { JSX } from 'react';

interface SearchResultsProps {
  results: {
    url?: string;
    title?: string;
    content: string
  }[];
  loading?: boolean;
}

const SearchResults = ({ results, loading }: SearchResultsProps): JSX.Element => {
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

export default SearchResults;

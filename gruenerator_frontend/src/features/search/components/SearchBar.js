import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { FaSearch } from 'react-icons/fa';
import '../styles/SearchBar.css';

const SearchBar = ({ onSearch, loading }) => {
  const [query, setQuery] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim() && !loading) {
      onSearch(query);
    }
  };

  return (
    <div className="search-bar-container">
      <form onSubmit={handleSubmit} className="search-form">
        <div className="search-input-wrapper">
          <FaSearch className="search-icon" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="search-input"
            placeholder="Grüne Suche"
            aria-label="Suchfeld"
            disabled={loading}
          />
        </div>
        <div className="search-buttons">
          <button 
            type="submit" 
            className={`search-button ${loading ? 'loading' : ''}`}
            disabled={loading}
          >
            {loading ? (
              <div className="button-loading-content">
                <div className="button-spinner"></div>
                <span>Analysiere...</span>
              </div>
            ) : (
              'Grüne Suche'
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

SearchBar.propTypes = {
  onSearch: PropTypes.func.isRequired,
  loading: PropTypes.bool
};

SearchBar.defaultProps = {
  loading: false
};

export default SearchBar; 
import React, { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { FaSearch, FaTimes } from 'react-icons/fa';

const ImageSearchBar = ({ onSearch, isActive, setIsActive, loading, initialQuery = '' }) => {
  const [query, setQuery] = useState(initialQuery);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isActive) {
      setTimeout(() => {
        console.log('Focusing input field');
        inputRef.current?.focus();
      }, 0);
    }
  }, [isActive]);

  const handleSearch = () => {
    console.log('ImageSearchBar: Search triggered with query:', query);
    if (query.trim()) {
      onSearch(query);
    } else {
      setError('Bitte geben Sie einen Suchbegriff ein');
    }
  };

  const handleInputChange = (e) => {
    setQuery(e.target.value);
    setError(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // Verhindert die Standard-Formular-Übermittlung
      handleSearch();
    } else if (e.key === 'Escape') {
      setIsActive(false);
    }
  };

  const handleButtonClick = () => {
    console.log('ImageSearchBar: Button clicked to activate search bar');
    setIsActive(true);
  };

  const handleSearchButtonClick = () => {
    console.log('ImageSearchBar: Search button (Lupe) clicked');
    handleSearch();
  };

  if (!isActive) {
    return (
      <button
        onClick={handleButtonClick}
        disabled={loading}
        className="image-search-button"
        aria-label="Bildsuche öffnen"
        type="button"
      >
        Bildsuche ändern
      </button>
    );
  }

  return (
    <div className="image-search-form">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder="Suchbegriffe eingeben"
        disabled={loading}
        className="image-search-input"
        aria-label="Suchbegriffe für Bilder"
      />
      <button
        type="button"
        onClick={handleSearchButtonClick}
        disabled={loading}
        className="image-search-submit"
        aria-label="Bildsuche starten"
      >
        <FaSearch />
      </button>
      <button
        type="button"
        onClick={() => setIsActive(false)}
        className="image-search-cancel"
        aria-label="Bildsuche abbrechen"
      >
        <FaTimes />
      </button>
      {error && <p className="image-search-error" role="alert">{error}</p>}
    </div>
  );
};

ImageSearchBar.propTypes = {
  onSearch: PropTypes.func.isRequired,
  isActive: PropTypes.bool.isRequired,
  setIsActive: PropTypes.func.isRequired,
  loading: PropTypes.bool.isRequired,
  initialQuery: PropTypes.string,
};

export default ImageSearchBar;

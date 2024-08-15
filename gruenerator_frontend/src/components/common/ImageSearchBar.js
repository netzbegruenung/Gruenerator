import React, { useState, useCallback } from 'react';
import { FaSearch, FaTimes } from 'react-icons/fa';
import { useSharepicGeneratorContext } from '../utils/Sharepic/SharepicGeneratorContext';
import '../../assets/styles/components/unsplash.css';


const ImageSearchBar = () => {
  const [query, setQuery] = useState('');
  const { state, handleUnsplashSearch, setSearchBarActive } = useSharepicGeneratorContext();
  const { loading, error, isSearchBarActive } = state;

  const handleSearch = useCallback(() => {
    console.log('handleSearch called. Query:', query);
    if (query.trim()) {
      console.log('Calling handleUnsplashSearch with query:', query);
      handleUnsplashSearch(query);
      setSearchBarActive(false);
    }
  }, [query, handleUnsplashSearch, setSearchBarActive]);

  if (!isSearchBarActive) {
    return (
      <button
        onClick={() => {
          console.log('Bildsuche ändern button clicked. Current isSearchBarActive:', isSearchBarActive);
          setSearchBarActive(true);
        }}
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
  <form className="image-search-form-element" onSubmit={(e) => e.preventDefault()}>
  <input
          type="text"
          value={query}
          onChange={(e) => {
            console.log('Query changed:', e.target.value);
            setQuery(e.target.value);
          }}
          placeholder="Suchbegriffe eingeben"
          disabled={loading}
          className="image-search-input"
          aria-label="Suchbegriffe für Bilder"
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={loading}
          className="image-search-submit"
          aria-label="Bildsuche starten"
        >
          <FaSearch />
        </button>
        <button
          type="button"
          onClick={() => setSearchBarActive(false)}
          className="image-search-cancel"
          aria-label="Bildsuche abbrechen"
        >
          <FaTimes />
        </button>
      </form>
      {loading && <p>Suche läuft...</p>}
      {error && <p className="image-search-error" role="alert">{error}</p>}
    </div>
  );
};

export default ImageSearchBar;
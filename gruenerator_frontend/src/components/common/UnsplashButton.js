import React from 'react';
import PropTypes from 'prop-types';
import '../../assets/styles/components/sharepic.css';

const UnsplashButton = ({ searchTerms }) => {
  const handleUnsplashClick = () => {
    if (!searchTerms || searchTerms.length === 0) return;
    
    // Nimm den ersten Suchbegriff und bereite ihn für die URL vor
    const searchQuery = encodeURIComponent(searchTerms[0]);
    const unsplashUrl = `https://unsplash.com/de/s/fotos/${searchQuery}?license=free`;
    
    // Öffne in neuem Tab
    window.open(unsplashUrl, '_blank');
  };

  return (
    <button
      onClick={handleUnsplashClick}
      disabled={!searchTerms || searchTerms.length === 0}
      className="unsplash-search-button"
      aria-label="Auf Unsplash suchen"
    >
      <svg width="20" height="20" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
        <path d="M10 9V0h12v9H10zm12 5h10v18H0V14h10v9h12v-9z" fill="currentColor"/>
      </svg>
      Auf Unsplash suchen
    </button>
  );
};

UnsplashButton.propTypes = {
  searchTerms: PropTypes.arrayOf(PropTypes.string)
};

export default UnsplashButton; 
import React from 'react';
import PropTypes from 'prop-types';
import { FaUnsplash } from 'react-icons/fa';

const UnsplashButton = ({ searchTerms }) => {
  const handleUnsplashClick = () => {
    if (!searchTerms || searchTerms.length === 0) return;

    const searchQuery = encodeURIComponent(searchTerms[0]);
    const unsplashUrl = `https://unsplash.com/de/s/fotos/${searchQuery}?license=free`;

    window.open(unsplashUrl, '_blank');
  };

  return (
    <button
      type="button"
      onClick={handleUnsplashClick}
      disabled={!searchTerms || searchTerms.length === 0}
      className="unsplash-search-button"
      aria-label="unsplash"
    >
      <FaUnsplash />
      unsplash
    </button>
  );
};

UnsplashButton.propTypes = {
  searchTerms: PropTypes.arrayOf(PropTypes.string)
};

export default UnsplashButton;

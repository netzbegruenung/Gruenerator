import React from 'react';
import PropTypes from 'prop-types';
import SearchDepthSelector from './SearchDepthSelector'; // Import the new component

const SearchBar = ({
  searchTerm,
  onSearchChange,
  placeholder = 'Durchsuchen...',
  // Add props for the selector
  searchDepthOptions,
  currentSearchDepth,
  onSearchDepthChange,
}) => {
  // Determine if the selector should be rendered
  const showSelector = searchDepthOptions && currentSearchDepth && onSearchDepthChange;

  return (
    // Add a container div
    <div className="search-bar-container">
      <input
        type="text"
        className="gallery-search-input" // Keep this for basic input styles
        placeholder={placeholder}
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
        aria-label={placeholder}
      />
      {/* Conditionally render the selector */}
      {showSelector && (
        <SearchDepthSelector
          options={searchDepthOptions}
          currentValue={currentSearchDepth}
          onChange={onSearchDepthChange}
        />
      )}
    </div>
  );
};

SearchBar.propTypes = {
  searchTerm: PropTypes.string.isRequired,
  onSearchChange: PropTypes.func.isRequired,
  placeholder: PropTypes.string,
  // Add prop types for the selector props
  searchDepthOptions: PropTypes.array,
  currentSearchDepth: PropTypes.string,
  onSearchDepthChange: PropTypes.func,
};

export default SearchBar; 
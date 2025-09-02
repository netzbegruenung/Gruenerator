import React from 'react';
import PropTypes from 'prop-types';

/**
 * Search mode filter component for use in SearchBar cog dropdown
 * @param {Object} props - Component props
 * @param {string} props.activeSearchMode - Currently active search mode
 * @param {Function} props.onSearchModeChange - Callback when search mode changes
 * @returns {JSX.Element} Search mode filter component
 */
const SearchModeFilter = ({ 
  activeSearchMode, 
  onSearchModeChange 
}) => {
  const searchModes = [
    { id: 'web', label: 'Web-Suche' },
    { id: 'standard', label: 'Standard-Suche' },
    { id: 'deep', label: 'Deep Research' }
  ];

  return (
    <div className="search-mode-filter">
      <div className="search-option-group">
        <div className="radio-button-group" role="radiogroup" aria-labelledby="search-mode-label">
          {searchModes.map((mode) => (
            <label 
              key={mode.id}
              className={`radio-label ${activeSearchMode === mode.id ? 'active' : ''}`}
            >
              <input
                type="radio"
                name="searchMode"
                value={mode.id}
                checked={activeSearchMode === mode.id}
                onChange={() => onSearchModeChange(mode.id)}
                aria-label={mode.label}
              />
              {mode.label}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
};

SearchModeFilter.propTypes = {
  activeSearchMode: PropTypes.string.isRequired,
  onSearchModeChange: PropTypes.func.isRequired
};

export default SearchModeFilter;
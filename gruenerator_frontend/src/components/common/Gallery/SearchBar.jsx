import React, { useState, useRef } from 'react';
import PropTypes from 'prop-types';
import { motion } from "motion/react";
import AdvancedSearchOptions from './AdvancedSearchOptions';

const SearchBar = ({
  searchTerm,
  onSearchChange,
  placeholder = 'Durchsuchen...',
  searchDepthOptions,
  currentSearchDepth,
  onSearchDepthChange,
  contentType = 'antraege',
  categories,
  selectedCategory,
  onCategoryChange,
  showCategoryFilter
}) => {
  const [showOptions, setShowOptions] = useState(false);
  const toggleButtonRef = useRef(null);

  // Steuern der erweiterten Suchoptionen
  const toggleOptions = (e) => {
    e.preventDefault();
    setShowOptions(prevShowOptions => !prevShowOptions);
  };

  const closeOptions = () => {
    setShowOptions(false);
  };

  return (
    <div className="search-bar-container">
      <motion.input
        type="text"
        className="gallery-search-input"
        placeholder={placeholder}
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
        aria-label={placeholder}
        initial={{ opacity: 0.8 }}
        animate={{ opacity: 1 }}
        whileFocus={{ scale: 1.01 }}
        transition={{ duration: 0.2 }}
      />
      
      {/* Zahnrad-Icon für Suchoptionen */}
      <motion.button 
        ref={toggleButtonRef}
        className={`search-options-toggle ${showOptions ? 'active' : ''}`}
        onClick={toggleOptions}
        aria-label="Suchoptionen anzeigen/ausblenden"
        title="Suchoptionen"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
      >
        <motion.span
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          animate={{ 
            rotate: showOptions ? 90 : 0,
          }}
          transition={{ 
            type: "spring",
            stiffness: 300,
            damping: 20
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82-.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </motion.span>
      </motion.button>
      
      {/* Erweiterte Suchoptionen */}
      <AdvancedSearchOptions
        isOpen={showOptions}
        onClose={closeOptions}
        searchModeOptions={searchDepthOptions}
        currentSearchMode={currentSearchDepth}
        onSearchModeChange={onSearchDepthChange}
        contentType={contentType}
        toggleButtonRef={toggleButtonRef}
        categories={categories}
        selectedCategory={selectedCategory}
        onCategoryChange={onCategoryChange}
        showCategoryFilter={showCategoryFilter}
      />
    </div>
  );
};

SearchBar.propTypes = {
  searchTerm: PropTypes.string.isRequired,
  onSearchChange: PropTypes.func.isRequired,
  placeholder: PropTypes.string,
  searchDepthOptions: PropTypes.arrayOf(PropTypes.shape({
    value: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    disabled: PropTypes.bool
  })),
  currentSearchDepth: PropTypes.string,
  onSearchDepthChange: PropTypes.func,
  contentType: PropTypes.string,
  categories: PropTypes.array,
  selectedCategory: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onCategoryChange: PropTypes.func,
  showCategoryFilter: PropTypes.bool
};

export default SearchBar; 
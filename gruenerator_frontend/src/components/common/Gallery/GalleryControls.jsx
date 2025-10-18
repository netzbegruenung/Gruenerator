import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { AnimatePresence, motion } from 'motion/react';

const GalleryControls = ({
  searchTerm,
  onSearchChange,
  placeholder,
  searchModes,
  currentSearchMode,
  onSearchModeChange,
  contentTypes,
  activeContentType,
  onContentTypeChange,
  categories,
  selectedCategory,
  onCategoryChange,
  showCategoryFilter
}) => {
  const [showOptions, setShowOptions] = useState(false);
  const toggleButtonRef = useRef(null);
  const optionsRef = useRef(null);

  const toggleOptions = (event) => {
    event.preventDefault();
    setShowOptions((prev) => !prev);
  };

  useEffect(() => {
    if (!showOptions) return undefined;

    const handleClickOutside = (event) => {
      if (!optionsRef.current) return;
      const clickedOutside = !optionsRef.current.contains(event.target) &&
        (!toggleButtonRef.current || !toggleButtonRef.current.contains(event.target));
      if (clickedOutside) {
        setShowOptions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showOptions]);

  useEffect(() => {
    setShowOptions(false);
  }, [activeContentType]);

  return (
    <div className="gallery-controls">
      <div className="search-bar-container">
        <motion.input
          type="text"
          className="gallery-search-input"
          placeholder={placeholder}
          value={searchTerm}
          onChange={(event) => onSearchChange(event.target.value)}
          aria-label={placeholder}
          initial={{ opacity: 0.8 }}
          animate={{ opacity: 1 }}
          whileFocus={{ scale: 1.01 }}
          transition={{ duration: 0.2 }}
        />

        <motion.button
          ref={toggleButtonRef}
          className={`search-options-toggle ${showOptions ? 'active' : ''}`}
          onClick={toggleOptions}
          aria-label="Suchoptionen anzeigen/ausblenden"
          title="Suchoptionen"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          type="button"
        >
          <motion.span
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            animate={{ rotate: showOptions ? 90 : 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82-.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </motion.span>
        </motion.button>
      </div>

      {Array.isArray(contentTypes) && contentTypes.length > 1 && (
        <div className="gallery-category-filter content-type-selector">
          {contentTypes.map((type) => (
            <button
              key={type.id}
              type="button"
              className={`category-button ${activeContentType === type.id ? 'active' : ''}`}
              onClick={() => onContentTypeChange(type.id)}
              aria-pressed={activeContentType === type.id}
            >
              {type.label}
              {type.disabled && <span className="content-type-badge">Bald</span>}
            </button>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showOptions && (
          <motion.div
            className="advanced-search-options"
            ref={optionsRef}
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            <div className="search-options-header">
              <motion.h3 initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
                Suchoptionen
              </motion.h3>
              <motion.button
                className="close-button"
                type="button"
                onClick={() => setShowOptions(false)}
                aria-label="Schließen"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                ×
              </motion.button>
            </div>

            {Array.isArray(searchModes) && searchModes.length > 0 && (
              <motion.div
                className="search-option-group search-depth-group"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <span className="search-option-label">Suchtiefe:</span>
                <div className="radio-button-group" role="radiogroup">
                  {searchModes
                    .filter((mode) => !mode.disabled)
                    .map((mode, index) => (
                      <motion.label
                        key={mode.value}
                        className={`radio-label ${currentSearchMode === mode.value ? 'active' : ''}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.2 + index * 0.1 }}
                        whileHover={{ scale: 1.05 }}
                      >
                        <input
                          type="radio"
                          name="searchDepth"
                          value={mode.value}
                          checked={currentSearchMode === mode.value}
                          onChange={() => onSearchModeChange(mode.value)}
                          aria-label={mode.label}
                        />
                        {mode.label}
                      </motion.label>
                    ))}
                </div>
              </motion.div>
            )}

            {showCategoryFilter && Array.isArray(categories) && categories.length > 0 && (
              <motion.div
                className="search-option-group category-filter-group"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <span className="search-option-label">Kategorien:</span>
                <div className="gallery-category-filter radio-button-group" role="group">
                  {categories.map((category, index) => (
                    <motion.button
                      key={category.id}
                      type="button"
                      className={`category-button ${selectedCategory === category.id ? 'active' : ''}`}
                      onClick={() => onCategoryChange(category.id)}
                      aria-pressed={selectedCategory === category.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.3 + index * 0.05 }}
                      whileHover={{ scale: 1.05 }}
                    >
                      {category.label}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

GalleryControls.propTypes = {
  searchTerm: PropTypes.string.isRequired,
  onSearchChange: PropTypes.func.isRequired,
  placeholder: PropTypes.string,
  searchModes: PropTypes.arrayOf(PropTypes.shape({
    value: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    disabled: PropTypes.bool
  })),
  currentSearchMode: PropTypes.string,
  onSearchModeChange: PropTypes.func,
  contentTypes: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    disabled: PropTypes.bool
  })),
  activeContentType: PropTypes.string,
  onContentTypeChange: PropTypes.func,
  categories: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    label: PropTypes.string.isRequired
  })),
  selectedCategory: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onCategoryChange: PropTypes.func,
  showCategoryFilter: PropTypes.bool
};

GalleryControls.defaultProps = {
  placeholder: 'Durchsuchen...',
  searchModes: [],
  currentSearchMode: 'title',
  onSearchModeChange: () => {},
  contentTypes: [],
  activeContentType: undefined,
  onContentTypeChange: () => {},
  categories: [],
  selectedCategory: 'all',
  onCategoryChange: () => {},
  showCategoryFilter: false
};

export default GalleryControls;

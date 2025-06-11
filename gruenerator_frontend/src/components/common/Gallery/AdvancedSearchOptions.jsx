import React, { useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { motion, AnimatePresence } from "motion/react";

const AdvancedSearchOptions = ({ 
  isOpen, 
  onClose, 
  searchModeOptions, 
  currentSearchMode, 
  onSearchModeChange,
  contentType,
  toggleButtonRef,
  categories,
  selectedCategory,
  onCategoryChange,
  showCategoryFilter
}) => {
  const optionsRef = useRef(null);

  // Schließen der gesamten Suchoptionen bei Klick außerhalb
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutsideOptions = (event) => {
      if (optionsRef.current && 
          !optionsRef.current.contains(event.target) &&
          toggleButtonRef.current &&
          !toggleButtonRef.current.contains(event.target)
      ) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutsideOptions);
    return () => {
      document.removeEventListener('mousedown', handleClickOutsideOptions);
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          className="advanced-search-options"
          ref={optionsRef}
          initial={{ opacity: 0, y: -10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
        >
          <div className="search-options-header">
            <motion.h3
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
            >
              Suchoptionen
            </motion.h3>
            <motion.button 
              className="close-button" 
              onClick={onClose} 
              aria-label="Schließen"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              ×
            </motion.button>
          </div>
          
          <motion.div 
            className="search-option-group search-depth-group"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <span className="search-option-label">Suchtiefe:</span>
            <div className="radio-button-group" role="radiogroup" aria-labelledby="search-depth-label">
              {searchModeOptions.map((option, index) => (
                !option.disabled && (
                  <motion.label 
                    key={option.value} 
                    className={`radio-label ${currentSearchMode === option.value ? 'active' : ''}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 + (index * 0.1) }}
                    whileHover={{ scale: 1.05 }}
                  >
                    <input
                      type="radio"
                      name="searchDepth"
                      value={option.value}
                      checked={currentSearchMode === option.value}
                      onChange={() => onSearchModeChange(option.value)}
                      aria-label={option.label}
                    />
                    {option.label}
                  </motion.label>
                )
              ))}
            </div>
          </motion.div>

          {/* Inhaltstypspezifische Optionen */}
          {contentType === 'generators' && (
            <motion.div
              className="search-option-group content-specific-hints"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <span className="search-option-label">Hinweise für "Grüneratoren":</span>
              <p className="search-hint">Die Suche umfasst Namen, Titel und Beschreibung der Grüneratoren.</p>
            </motion.div>
          )}

          {/* Kategoriefilter-Bereich */}
          {showCategoryFilter && categories && categories.length > 0 && (
            <motion.div
              className="search-option-group category-filter-group"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <span className="search-option-label">Kategorien:</span>
              <div className="gallery-category-filter radio-button-group" role="group" aria-labelledby="category-filter-label">
                {categories.map((category, index) => (
                  <motion.button
                    key={category.id}
                    className={`category-button ${selectedCategory === category.id ? 'active' : ''}`}
                    onClick={() => onCategoryChange(category.id)}
                    aria-pressed={selectedCategory === category.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 + (index * 0.05) }}
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
  );
};

AdvancedSearchOptions.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  searchModeOptions: PropTypes.arrayOf(PropTypes.shape({
    value: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    disabled: PropTypes.bool,
  })).isRequired,
  currentSearchMode: PropTypes.string.isRequired,
  onSearchModeChange: PropTypes.func.isRequired,
  contentType: PropTypes.string.isRequired,
  toggleButtonRef: PropTypes.object,
  categories: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    label: PropTypes.string.isRequired,
  })),
  selectedCategory: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onCategoryChange: PropTypes.func,
  showCategoryFilter: PropTypes.bool
};

AdvancedSearchOptions.defaultProps = {
  categories: [],
  selectedCategory: null,
  onCategoryChange: () => {},
  showCategoryFilter: false,
};

export default AdvancedSearchOptions; 
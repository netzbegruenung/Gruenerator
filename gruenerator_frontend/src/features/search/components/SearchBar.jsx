import React, { useRef } from 'react';
import PropTypes from 'prop-types';
import { FaSearch, FaCog } from 'react-icons/fa';
import FilterPopover from '../../../components/common/FilterPopover';
import '../styles/SearchBarStyles.css';

const defaultExampleQuestions = [
  {
    icon: '🚲',
    text: 'Verkehrswende in Kommunen Beispiele'
  },
  {
    icon: '🌍',
    text: 'Klimaschutz für Kommunen Ideen'
  }
];

const SearchBar = ({ 
  onSearch, 
  loading, 
  value, 
  onChange, 
  placeholder = 'Suchbegriff eingeben...',
  exampleQuestions = defaultExampleQuestions,
  onFilterClick,
  filterComponent,
  showFilters = false,
  hideExamples = false,
  hideDisclaimer = false,
  filterTitle = "Filter"
}) => {
  const filterButtonRef = useRef(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (value.trim() && !loading) {
      onSearch(value.trim());
    }
  };

  const handleFilterClick = (e) => {
    e.preventDefault();
    if (onFilterClick) {
      onFilterClick();
    }
  };

  const handleFilterClose = () => {
    if (onFilterClick) {
      onFilterClick(); // Toggle off
    }
  };

  const hasFilterFunctionality = onFilterClick || filterComponent;

  return (
    <div className="search-bar-container">
      <form onSubmit={handleSubmit} className="search-form">
        <div className="search-input-wrapper">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="search-input"
            placeholder={placeholder}
            aria-label="Suchfeld"
            disabled={loading}
          />
          <div className="search-buttons">
            <button 
              type="submit"
              className="search-icon-button"
              disabled={loading || !value.trim()}
              aria-label="Suchen"
            >
              {loading ? (
                <div className="button-spinner"></div>
              ) : (
                <FaSearch className="search-icon" />
              )}
            </button>
            {hasFilterFunctionality && (
              <button 
                ref={filterButtonRef}
                type="button"
                className={`filter-icon-button ${showFilters ? 'active' : ''}`}
                onClick={handleFilterClick}
                aria-label="Filter"
                disabled={loading}
              >
                <FaCog className="filter-icon" />
              </button>
            )}
          </div>
        </div>
        
        {!hideDisclaimer && (
          <div className="ai-disclaimer">
            KI-Systeme können Fakten falsch interpretieren oder erfinden. Bitte prüfe die Quellen.
          </div>
        )}
        
        {!hideExamples && exampleQuestions && exampleQuestions.length > 0 && (
          <div className="example-questions">
            {exampleQuestions.map((question, index) => (
              <button
                key={index}
                type="button"
                className="example-question"
                onClick={() => onChange(question.text)}
              >
                <span>{question.icon}</span>
                <span>{question.text}</span>
              </button>
            ))}
          </div>
        )}
        
        {/* Filter Popover */}
        {filterComponent && (
          <FilterPopover
            isOpen={showFilters}
            onClose={handleFilterClose}
            anchorRef={filterButtonRef}
            title={filterTitle}
          >
            {filterComponent}
          </FilterPopover>
        )}
      </form>
    </div>
  );
};

SearchBar.propTypes = {
  onSearch: PropTypes.func.isRequired,
  loading: PropTypes.bool,
  value: PropTypes.string,
  onChange: PropTypes.func,
  placeholder: PropTypes.string,
  exampleQuestions: PropTypes.arrayOf(PropTypes.shape({
    icon: PropTypes.string.isRequired,
    text: PropTypes.string.isRequired
  })),
  onFilterClick: PropTypes.func,
  filterComponent: PropTypes.node,
  showFilters: PropTypes.bool,
  hideExamples: PropTypes.bool,
  hideDisclaimer: PropTypes.bool,
  filterTitle: PropTypes.string
};

SearchBar.defaultProps = {
  loading: false,
  value: '',
  onChange: () => {},
  exampleQuestions: defaultExampleQuestions,
  showFilters: false,
  hideExamples: false,
  hideDisclaimer: false,
  filterTitle: "Filter"
};

export default SearchBar; 
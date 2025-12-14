import React, { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { FaSearch } from 'react-icons/fa';
import { HiCog } from 'react-icons/hi';
import Icon from '../../../components/common/Icon';
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
  onDeepResearchToggle,
  isDeepResearchActive = false,
  hideExamples = false,
  hideDisclaimer = false,
  settingsContent = null
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target)) {
        setShowSettings(false);
      }
    };

    if (showSettings) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSettings]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (value.trim() && !loading) {
      onSearch(value.trim());
    }
  };

  const handleDeepResearchToggle = (e) => {
    e.preventDefault();
    if (onDeepResearchToggle) {
      onDeepResearchToggle();
    }
  };

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
            {settingsContent && (
              <div className="search-settings" ref={settingsRef}>
                <button
                  type="button"
                  className={`search-settings-toggle ${showSettings ? 'active' : ''}`}
                  onClick={() => setShowSettings(!showSettings)}
                  aria-label="Einstellungen"
                  title="Einstellungen"
                >
                  <HiCog />
                </button>
                {showSettings && (
                  <div className="search-settings-dropdown">
                    {settingsContent}
                  </div>
                )}
              </div>
            )}
            {onDeepResearchToggle && (
              <button
                type="button"
                className={`deep-research-toggle ${isDeepResearchActive ? 'active' : ''}`}
                onClick={handleDeepResearchToggle}
                aria-label={isDeepResearchActive ? 'Deep Research deaktivieren' : 'Deep Research aktivieren'}
                disabled={loading}
                title={isDeepResearchActive ? 'Deep Research aktiv' : 'Deep Research aktivieren'}
              >
                <Icon category="ui" name="brain" />
              </button>
            )}
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
  onDeepResearchToggle: PropTypes.func,
  isDeepResearchActive: PropTypes.bool,
  hideExamples: PropTypes.bool,
  hideDisclaimer: PropTypes.bool,
  settingsContent: PropTypes.node
};

SearchBar.defaultProps = {
  loading: false,
  value: '',
  onChange: () => {},
  exampleQuestions: defaultExampleQuestions,
  isDeepResearchActive: false,
  hideExamples: false,
  hideDisclaimer: false
};

export default SearchBar; 
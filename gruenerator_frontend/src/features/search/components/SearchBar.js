import React from 'react';
import PropTypes from 'prop-types';
import { FaSearch } from 'react-icons/fa';
import '../styles/SearchBar.css';

const exampleQuestions = [
  {
    icon: '🚲',
    text: 'Verkehrswende in Kommunen Beispiele'
  },
  {
    icon: '🌍',
    text: 'Klimaschutz für Kommunen Ideen'
  }
];

const SearchBar = ({ onSearch, loading, value, onChange }) => {
  const handleSubmit = (e) => {
    e.preventDefault();
    if (value.trim() && !loading) {
      onSearch(value.trim());
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
            placeholder="Deine Frage..."
            aria-label="Suchfeld"
            disabled={loading}
          />
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
        
        <div className="ai-disclaimer">
          KI-Systeme können Fakten falsch interpretieren oder erfinden. Bitte prüfe die Quellen.
        </div>
        
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
      </form>
    </div>
  );
};

SearchBar.propTypes = {
  onSearch: PropTypes.func.isRequired,
  loading: PropTypes.bool,
  value: PropTypes.string,
  onChange: PropTypes.func
};

SearchBar.defaultProps = {
  loading: false,
  value: '',
  onChange: () => {}
};

export default SearchBar; 
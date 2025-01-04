import React from 'react';
import PropTypes from 'prop-types';
import { CSSTransition } from 'react-transition-group';

export const SloganAlternativesButton = ({ isExpanded, onClick }) => {
  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  };

  return (
    <div className="alternatives-button-wrapper">
      <CSSTransition
        in={!isExpanded}
        timeout={300}
        classNames="alternatives-fade"
        unmountOnExit
      >
        <button 
          type="button"
          className="alternatives-button"
          onClick={handleClick}
          aria-expanded={isExpanded}
          aria-label="Anderer Slogan"
        >
          Anderer Slogan
        </button>
      </CSSTransition>

      <CSSTransition
        in={isExpanded}
        timeout={300}
        classNames="alternatives-fade"
        unmountOnExit
      >
        <button 
          type="button"
          className="alternatives-button"
          onClick={handleClick}
          aria-expanded={isExpanded}
          aria-label="Ausblenden"
        >
          Ausblenden
        </button>
      </CSSTransition>
    </div>
  );
};

SloganAlternativesButton.propTypes = {
  isExpanded: PropTypes.bool.isRequired,
  onClick: PropTypes.func.isRequired
};

export const SloganAlternativesDisplay = ({ currentSlogan, alternatives, onSloganSelect }) => {
  if (!alternatives || alternatives.length === 0) return null;

  return (
    <div className="slogan-alternatives">
      <div className="slogan-list">
        {alternatives.map((slogan, index) => (
          <div 
            key={index}
            className="slogan-item"
            onClick={() => onSloganSelect(slogan)}
          >
            <div className="slogan-item-content">
              {slogan.line1 && <p>{slogan.line1}</p>}
              {slogan.line2 && <p>{slogan.line2}</p>}
              {slogan.line3 && <p>{slogan.line3}</p>}
            </div>
          </div>
        ))}
      </div>

      <div className="slogan-alternatives-header">
        <h4 className="slogan-alternatives-title">Aktuelle Auswahl</h4>
      </div>
      <div className="slogan-item current">
        <div className="slogan-item-content" onClick={() => onSloganSelect(currentSlogan)}>
          {currentSlogan.line1 && <p>{currentSlogan.line1}</p>}
          {currentSlogan.line2 && <p>{currentSlogan.line2}</p>}
          {currentSlogan.line3 && <p>{currentSlogan.line3}</p>}
        </div>
      </div>
    </div>
  );
};

SloganAlternativesDisplay.propTypes = {
  currentSlogan: PropTypes.shape({
    line1: PropTypes.string,
    line2: PropTypes.string,
    line3: PropTypes.string
  }).isRequired,
  alternatives: PropTypes.arrayOf(
    PropTypes.shape({
      line1: PropTypes.string,
      line2: PropTypes.string,
      line3: PropTypes.string
    })
  ).isRequired,
  onSloganSelect: PropTypes.func.isRequired
}; 
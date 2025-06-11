import React, { useRef, forwardRef } from 'react';
import PropTypes from 'prop-types';
import { LazyMotion, m, AnimatePresence } from 'motion/react';

// Lazy load motion features
const loadFeatures = () => import('motion/react').then(res => res.domAnimation);

export const SloganAlternativesButton = forwardRef(({ isExpanded, onClick }, ref) => {
  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  };

  return (
    <LazyMotion features={loadFeatures}>
      <div className="alternatives-button-wrapper" ref={ref}>
        <AnimatePresence>
          {!isExpanded && (
            <m.button
              key="show-button"
              type="button"
              className="alternatives-button"
              onClick={handleClick}
              aria-expanded={isExpanded}
              aria-label="Alternativen anzeigen"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              Alternativen anzeigen
            </m.button>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isExpanded && (
            <m.button
              key="hide-button"
              type="button"
              className="alternatives-button"
              onClick={handleClick}
              aria-expanded={isExpanded}
              aria-label="Ausblenden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              Ausblenden
            </m.button>
          )}
        </AnimatePresence>
      </div>
    </LazyMotion>
  );
});

SloganAlternativesButton.displayName = 'SloganAlternativesButton';

SloganAlternativesButton.propTypes = {
  isExpanded: PropTypes.bool.isRequired,
  onClick: PropTypes.func.isRequired
};

export const SloganAlternativesDisplay = ({ currentSlogan, alternatives, onSloganSelect }) => {
  if (!alternatives || alternatives.length === 0) return null;

  const renderContent = (item) => {
    if (item.quote) {
      return (
        <div className="slogan-item-content">
          <p>{item.quote}</p>
        </div>
      );
    }
    return (
      <div className="slogan-item-content">
        {item.line1 && <p>{item.line1}</p>}
        {item.line2 && <p>{item.line2}</p>}
        {item.line3 && <p>{item.line3}</p>}
      </div>
    );
  };

  return (
    <div className="slogan-alternatives">
      <div className="slogan-alternatives-header">
        <h4 className="slogan-alternatives-title">Alternative Vorschläge</h4>
      </div>
      <div className="slogan-list">
        {alternatives.map((item, index) => (
          <div 
            key={index}
            className="slogan-item"
            onClick={() => onSloganSelect(item)}
          >
            {renderContent(item)}
          </div>
        ))}
      </div>

      <div className="slogan-alternatives-header">
        <h4 className="slogan-alternatives-title">Aktuelle Auswahl</h4>
      </div>
      <div className="slogan-item current">
        {renderContent(currentSlogan)}
      </div>
    </div>
  );
};

SloganAlternativesDisplay.propTypes = {
  currentSlogan: PropTypes.oneOfType([
    PropTypes.shape({
      line1: PropTypes.string,
      line2: PropTypes.string,
      line3: PropTypes.string
    }),
    PropTypes.shape({
      quote: PropTypes.string
    })
  ]).isRequired,
  alternatives: PropTypes.arrayOf(
    PropTypes.oneOfType([
      PropTypes.shape({
        line1: PropTypes.string,
        line2: PropTypes.string,
        line3: PropTypes.string
      }),
      PropTypes.shape({
        quote: PropTypes.string
      })
    ])
  ).isRequired,
  onSloganSelect: PropTypes.func.isRequired
}; 
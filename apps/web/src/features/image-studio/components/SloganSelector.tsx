import React, { useRef } from 'react';
import PropTypes from 'prop-types';

import '../../../assets/styles/components/actions/slogan-alternatives.css';

const hasContent = (item) => {
  if (!item) return false;
  if (item.quote) return true;
  if (item.header || item.subheader || item.body) return true;
  if (item.line1 || item.line2 || item.line3) return true;
  return false;
};

const renderContent = (item) => {
  if (item.quote) {
    return (
      <div className="slogan-content">
        <p>{item.quote}</p>
      </div>
    );
  }
  if (item.header || item.subheader || item.body) {
    return (
      <div className="slogan-content">
        {item.header && <p className="slogan-content__header">{item.header}</p>}
        {item.subheader && <p className="slogan-content__subheader">{item.subheader}</p>}
        {item.body && <p className="slogan-content__body">{item.body}</p>}
      </div>
    );
  }
  return (
    <div className="slogan-content">
      {item.line1 && <p>{item.line1}</p>}
      {item.line2 && <p>{item.line2}</p>}
      {item.line3 && <p>{item.line3}</p>}
    </div>
  );
};

const isSameSlogan = (a, b) => {
  if (!a || !b) return false;
  if (a.quote && b.quote) return a.quote === b.quote;
  if (a.header && b.header) return a.header === b.header && a.body === b.body;
  return a.line1 === b.line1 && a.line2 === b.line2 && a.line3 === b.line3;
};

export const SloganSelector = ({
  currentSlogan,
  alternatives,
  onSelect,
  loading = false
}) => {
  const stableOptionsRef = useRef(null);

  if (stableOptionsRef.current === null && (hasContent(currentSlogan) || alternatives?.length > 0)) {
    const options = [];
    if (hasContent(currentSlogan)) {
      options.push(currentSlogan);
    }
    if (alternatives && alternatives.length > 0) {
      alternatives.forEach(alt => {
        if (!options.some(opt => isSameSlogan(opt, alt))) {
          options.push(alt);
        }
      });
    }
    stableOptionsRef.current = options;
  }

  const allOptions = stableOptionsRef.current || [];

  if (allOptions.length === 0) {
    return null;
  }

  return (
    <div className="slogan-selector">
      <div className="slogan-hero">
        {renderContent(currentSlogan)}
      </div>

      {allOptions.length > 1 && (
        <div className="slogan-options-list">
          {allOptions.map((item, index) => {
            const isSelected = isSameSlogan(item, currentSlogan);
            return (
              <button
                key={index}
                type="button"
                className={`slogan-option ${isSelected ? 'slogan-option--selected' : ''}`}
                onClick={() => onSelect(item)}
                disabled={loading}
              >
                {renderContent(item)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

SloganSelector.propTypes = {
  currentSlogan: PropTypes.oneOfType([
    PropTypes.shape({
      line1: PropTypes.string,
      line2: PropTypes.string,
      line3: PropTypes.string
    }),
    PropTypes.shape({
      quote: PropTypes.string
    }),
    PropTypes.shape({
      header: PropTypes.string,
      subheader: PropTypes.string,
      body: PropTypes.string
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
      }),
      PropTypes.shape({
        header: PropTypes.string,
        subheader: PropTypes.string,
        body: PropTypes.string
      })
    ])
  ),
  onSelect: PropTypes.func.isRequired,
  loading: PropTypes.bool
};

export default SloganSelector;

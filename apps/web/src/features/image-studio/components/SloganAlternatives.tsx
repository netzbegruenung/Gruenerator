import React from 'react';

import '../../../assets/styles/components/actions/slogan-alternatives.css';

export const SloganAlternativesDisplay = ({ currentSlogan, alternatives, onSloganSelect, loading = false }) => {
  const renderContent = (item, isHero = false) => {
    const className = isHero ? 'slogan-content slogan-content--hero' : 'slogan-content';

    if (item.quote) {
      return (
        <div className={className}>
          <p>{item.quote}</p>
        </div>
      );
    }
    if (item.header || item.subheader || item.body) {
      return (
        <div className={className}>
          {item.header && <p className="slogan-content__header">{item.header}</p>}
          {item.subheader && <p className="slogan-content__subheader">{item.subheader}</p>}
          {item.body && <p className="slogan-content__body">{item.body}</p>}
        </div>
      );
    }
    return (
      <div className={className}>
        {item.line1 && <p>{item.line1}</p>}
        {item.line2 && <p>{item.line2}</p>}
        {item.line3 && <p>{item.line3}</p>}
      </div>
    );
  };

  const hasContent = (item) => {
    return item.quote || item.line1 || item.header;
  };

  if (!hasContent(currentSlogan)) {
    return null;
  }

  return (
    <div className={`slogan-selector ${loading ? 'slogan-selector--loading' : ''}`}>
      <div className="slogan-hero">
        {renderContent(currentSlogan, true)}
      </div>

      {alternatives.length > 0 && (
        <div className="slogan-alternatives-row">
          {alternatives.map((item, index) => (
            <button
              key={index}
              type="button"
              className="slogan-alternative"
              onClick={() => !loading && onSloganSelect(item)}
              disabled={loading}
              tabIndex={loading ? -1 : 0}
            >
              {renderContent(item)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};


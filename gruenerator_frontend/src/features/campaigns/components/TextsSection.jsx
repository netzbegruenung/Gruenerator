import React from 'react';
import PropTypes from 'prop-types';
import TextCard from './TextCard';

const TextsSection = ({ texts, className }) => {
  return (
    <section className={`dashboard-section ${className || ''}`}>
      <h2>Texte</h2>
      {texts.length === 0 ? (
        <div className="no-results">Keine Texte gefunden</div>
      ) : (
        <div className="texts-grid">
          {texts.map(text => (
            <TextCard key={text.id} text={text} />
          ))}
        </div>
      )}
    </section>
  );
};

TextsSection.propTypes = {
  texts: PropTypes.array.isRequired,
  className: PropTypes.string
};

export default TextsSection; 
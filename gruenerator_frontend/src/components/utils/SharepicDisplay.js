import React from 'react';
import PropTypes from 'prop-types';

const SharepicDisplay = ({ imageData, isModified }) => {
  if (!imageData) {
    return <p>Kein Bild generiert</p>;
  }

  return (
    <div className="sharepic-display">
      {isModified && <div className="modified-indicator">Modifiziertes Bild</div>}
      <img 
        src={imageData} 
        alt={isModified ? "Modified Sharepic" : "Generated Sharepic"}
        onError={(e) => {
          console.error('Error loading image');
          e.target.style.display = 'none';
        }}
      />
    </div>
  );
};

SharepicDisplay.propTypes = {
  imageData: PropTypes.string,
  isModified: PropTypes.bool,
};

export default SharepicDisplay;
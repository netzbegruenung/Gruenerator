import React from 'react';
import PropTypes from 'prop-types';

const ImageModificationForm = ({ 
  fontSize, 
  balkenOffset, 
  onControlChange 
}) => {
  const handleFontSizeChange = (size) => {
    onControlChange('fontSize', size);
  };

  const handleBalkenOffsetChange = (index, direction) => {
    const newOffset = [...balkenOffset];
    newOffset[index] += direction * 50; // 50px Schritte
    newOffset[index] = Math.max(-100, Math.min(100, newOffset[index])); // Begrenzen Sie den Offset auf ±100px
    onControlChange('balkenOffset', newOffset);
  };

  return (
    <div className="image-modification-form">
      <div className="font-size-control">
        <span>Schriftgröße:</span>
        <button onClick={() => handleFontSizeChange(90)} className={fontSize === 90 ? 'active' : ''}>S</button>
        <button onClick={() => handleFontSizeChange(100)} className={fontSize === 100 ? 'active' : ''}>M</button>
        <button onClick={() => handleFontSizeChange(110)} className={fontSize === 110 ? 'active' : ''}>L</button>
      </div>
      {balkenOffset.map((offset, index) => (
        <div key={index} className="balken-offset-control">
          <button onClick={() => handleBalkenOffsetChange(index, -1)}>←</button>
          <span>Zeile {index + 1}</span>
          <button onClick={() => handleBalkenOffsetChange(index, 1)}>→</button>
        </div>
      ))}
    </div>
  );
};

ImageModificationForm.propTypes = {
  fontSize: PropTypes.number.isRequired,
  balkenOffset: PropTypes.arrayOf(PropTypes.number).isRequired,
  onControlChange: PropTypes.func.isRequired,
};

export default ImageModificationForm;
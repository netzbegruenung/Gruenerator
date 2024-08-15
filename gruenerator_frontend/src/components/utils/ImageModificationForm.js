import React from 'react';
import PropTypes from 'prop-types';
import { FaChevronLeft, FaChevronRight, FaChevronUp, FaChevronDown } from 'react-icons/fa';

import { 
  SHAREPIC_GENERATOR, 
  IMAGE_MODIFICATION,
} from './constants';

export const FontSizeControl = ({ fontSize, onControlChange }) => (
  <div className="font-size-control">
    <span>{IMAGE_MODIFICATION.LABELS.FONT_SIZE}</span>
    {IMAGE_MODIFICATION.FONT_SIZE.OPTIONS.map(option => (
      <button 
        key={option.label}
        onClick={() => onControlChange('fontSize', option.value)} 
        className={fontSize === option.value ? 'active' : ''}
      >
        {option.label}
      </button>
    ))}
  </div>
);

FontSizeControl.propTypes = {
  fontSize: PropTypes.number.isRequired,
  onControlChange: PropTypes.func.isRequired,
};

export const BalkenOffsetControl = ({ balkenOffset, onControlChange }) => {
  const handleOffsetChange = (index, direction) => {
    const newOffset = [...balkenOffset];
    newOffset[index] = Math.max(-250, Math.min(250, newOffset[index] + direction * 50));
    onControlChange('balkenOffset', newOffset);
  };

  return (
    <div className="balken-offset-control">
      {balkenOffset.map((offset, index) => (
        <div key={index} className="balken-offset-control-item">
          <label>Zeile {index + 1}</label>
          <div className="balken-offset-buttons">
            <button onClick={() => handleOffsetChange(index, -1)}>
              <FaChevronLeft />
            </button>
            <span>{offset}px</span>
            <button onClick={() => handleOffsetChange(index, 1)}>
              <FaChevronRight />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

BalkenOffsetControl.propTypes = {
  balkenOffset: PropTypes.arrayOf(PropTypes.number).isRequired,
  onControlChange: PropTypes.func.isRequired,
};

export const ColorSchemeControl = ({ colorScheme, onControlChange }) => {
  return (
    <div className="color-scheme-control">
      <span>{IMAGE_MODIFICATION.LABELS.COLOR_SCHEME}</span>
      <div className="color-scheme-images">
        {IMAGE_MODIFICATION.COLOR_SCHEMES.map((scheme, index) => (
        
          <button 
            key={index}
            className={`color-scheme-option ${JSON.stringify(colorScheme) === JSON.stringify(scheme.colors) ? 'active' : ''}`}
            onClick={() => onControlChange('colorScheme', scheme.colors)}
            aria-label={`Select ${scheme.name} color scheme`}
          >
            <img src={scheme.imageSrc} alt={scheme.name} className="color-scheme-image" />
          </button>
        ))}
      </div>
    </div>
  );
};

ColorSchemeControl.propTypes = {
  colorScheme: PropTypes.arrayOf(PropTypes.shape({
    background: PropTypes.string.isRequired,
    text: PropTypes.string.isRequired
  })).isRequired,
  onControlChange: PropTypes.func.isRequired,
};

const CrossControlBase = ({ title, description, offset, onOffsetChange, step }) => {
  const handleMove = (direction) => {
    const newOffset = [...offset];
    switch (direction) {
      case 'up':
        newOffset[1] -= step;
        break;
      case 'down':
        newOffset[1] += step;
        break;
      case 'left':
        newOffset[0] -= step;
        break;
      case 'right':
        newOffset[0] += step;
        break;
      default:
        break;
    }
    onOffsetChange(newOffset);
  };

  return (
    <div className="cross-control">
      <h4>{title}</h4>
      <p>{description}</p>
      <div className="cross-grid">
        <button onClick={() => handleMove('up')} className="cross-button up"><FaChevronUp /></button>
        <button onClick={() => handleMove('left')} className="cross-button left"><FaChevronLeft /></button>
        <div className="offset-display"></div>
        <button onClick={() => handleMove('right')} className="cross-button right"><FaChevronRight /></button>
        <button onClick={() => handleMove('down')} className="cross-button down"><FaChevronDown /></button>
      </div>
    </div>
  );
};

CrossControlBase.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string.isRequired,
  offset: PropTypes.arrayOf(PropTypes.number).isRequired,
  onOffsetChange: PropTypes.func.isRequired,
  step: PropTypes.number.isRequired,
};

export const BalkenGruppeControl = ({ offset, onOffsetChange }) => (
  <CrossControlBase
    title={IMAGE_MODIFICATION.LABELS.BALKEN_GRUPPE_TITLE}
    description={IMAGE_MODIFICATION.LABELS.BALKEN_GRUPPE_DESCRIPTION}
    offset={offset}
    onOffsetChange={onOffsetChange}
    step={IMAGE_MODIFICATION.BALKEN_GRUPPE_STEP}
  />
);

export const SonnenblumenControl = ({ offset, onOffsetChange }) => (
  <CrossControlBase
    title={IMAGE_MODIFICATION.LABELS.SUNFLOWER_TITLE}
    description={IMAGE_MODIFICATION.LABELS.SUNFLOWER_DESCRIPTION}
    offset={offset}
    onOffsetChange={onOffsetChange}
    step={IMAGE_MODIFICATION.SUNFLOWER_STEP}
  />
);

BalkenGruppeControl.propTypes = {
  offset: PropTypes.arrayOf(PropTypes.number).isRequired,
  onOffsetChange: PropTypes.func.isRequired,
};

SonnenblumenControl.propTypes = {
  offset: PropTypes.arrayOf(PropTypes.number).isRequired,
  onOffsetChange: PropTypes.func.isRequired,
};

export const CreditControl = ({ credit, onControlChange }) => (
  <div className="credit-control">
    <label htmlFor="credit">{IMAGE_MODIFICATION.LABELS.CREDIT}</label>
    <input
      type="text"
      id="credit"
      value={credit}
      onChange={(e) => onControlChange('credit', e.target.value)}
      placeholder="www.gruene-musterdorf.de"
    />
  </div>
);

CreditControl.propTypes = {
  credit: PropTypes.string,
  onControlChange: PropTypes.func.isRequired,
};

const ImageModificationForm = ({
  fontSize,
  balkenOffset,
  colorScheme,
  balkenGruppenOffset,
  sunflowerOffset,
  credit,
  onControlChange
}) => {
  const handleBalkenGruppeOffsetChange = (newOffset) => {
    const offsetDiff = [
      newOffset[0] - balkenGruppenOffset[0],
      newOffset[1] - balkenGruppenOffset[1]
    ];

    onControlChange('balkenGruppenOffset', newOffset);
    onControlChange('sunflowerOffset', [
      sunflowerOffset[0] + offsetDiff[0],
      sunflowerOffset[1] + offsetDiff[1]
    ]);
  };

  const handleSunflowerOffsetChange = (newOffset) => {
    onControlChange('sunflowerOffset', newOffset);
  };

  return (
    <div className="image-modification-form">
      <FontSizeControl fontSize={fontSize} onControlChange={onControlChange} />
      <BalkenOffsetControl balkenOffset={balkenOffset} onControlChange={onControlChange} />
      <ColorSchemeControl colorScheme={colorScheme} onControlChange={onControlChange} />
      <div className="offset-controls-group">
        <h3>{IMAGE_MODIFICATION.LABELS.OFFSET_CONTROLS_TITLE}</h3>
        <p>{IMAGE_MODIFICATION.LABELS.OFFSET_CONTROLS_DESCRIPTION}</p>
        <div className="offset-controls-content">
          <BalkenGruppeControl 
            offset={balkenGruppenOffset}
            onOffsetChange={handleBalkenGruppeOffsetChange}
          />
          <SonnenblumenControl 
            offset={sunflowerOffset}
            onOffsetChange={handleSunflowerOffsetChange}
          />
        </div>
      </div>
      <CreditControl credit={credit} onControlChange={onControlChange} />
    </div>
  );
};

ImageModificationForm.propTypes = {
  fontSize: PropTypes.number,
  balkenOffset: PropTypes.arrayOf(PropTypes.number),
  colorScheme: PropTypes.arrayOf(PropTypes.shape({
    background: PropTypes.string.isRequired,
    text: PropTypes.string.isRequired
  })),
  balkenGruppenOffset: PropTypes.arrayOf(PropTypes.number),
  sunflowerOffset: PropTypes.arrayOf(PropTypes.number),
  onControlChange: PropTypes.func.isRequired,
  credit: PropTypes.string,

};

ImageModificationForm.defaultProps = {
  fontSize: SHAREPIC_GENERATOR.DEFAULT_FONT_SIZE,
  balkenOffset: SHAREPIC_GENERATOR.DEFAULT_BALKEN_OFFSET,
  colorScheme: SHAREPIC_GENERATOR.DEFAULT_COLOR_SCHEME,
  balkenGruppenOffset: [0, 0],
  sunflowerOffset: [0, 0],
  credit: '',

};

export default ImageModificationForm;
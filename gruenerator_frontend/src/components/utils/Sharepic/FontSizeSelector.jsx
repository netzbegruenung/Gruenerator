import React from 'react';
import PropTypes from 'prop-types';
import { FONT_SIZES } from '../../utils/constants';

const FontSizeSelector = ({ fontSize, handleFontSizeChange }) => {
  return (
    <div className="form-group">
      <label htmlFor="fontSize">Schriftgröße:</label>
      <select
        id="fontSize"
        name="fontSize"
        value={fontSize}
        onChange={handleFontSizeChange}
      >
        {Object.entries(FONT_SIZES).map(([key, value]) => (
          <option key={key} value={key}>
            {key.toUpperCase()} ({value}px)
          </option>
        ))}
      </select>
    </div>
  );
};

FontSizeSelector.propTypes = {
  fontSize: PropTypes.oneOf(Object.keys(FONT_SIZES)).isRequired,
  handleFontSizeChange: PropTypes.func.isRequired,
};

export default FontSizeSelector;
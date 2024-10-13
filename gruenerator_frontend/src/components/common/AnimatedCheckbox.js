import React from 'react';
import PropTypes from 'prop-types';

const StyledCheckbox = ({ id, checked, onChange, label }) => {
  const checkboxId = id || `checkbox-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <div className="checkbox-wrapper-28">
      <input
        id={checkboxId}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="promoted-input-checkbox"
      />
      <label htmlFor={checkboxId}>
        <svg xmlns="http://www.w3.org/2000/svg" className="checkbox-svg" viewBox="0 0 24 24">
          <path 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M1.73 12.91l6.37 6.37L22.79 4.59"
          />
        </svg>
        <span className="checkbox-label">{label}</span>
      </label>
    </div>
  );
};

StyledCheckbox.propTypes = {
  id: PropTypes.string,
  checked: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
  label: PropTypes.string.isRequired
};

export default StyledCheckbox;
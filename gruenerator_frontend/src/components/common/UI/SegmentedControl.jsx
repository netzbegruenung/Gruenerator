import React, { useCallback } from 'react';
import PropTypes from 'prop-types';

// Define the SegmentedControl component
const SegmentedControl = ({
  steps = [], // Array of { value, label, disabled? }
  currentValue,
  onChange,
  disabled = false, // Overall disabled state
  label, // <-- New prop for the label text
  ariaLabel = 'Select option',
}) => {

  // Handle button click
  const handleClick = useCallback((value, stepDisabled) => {
    // Only call onChange if the specific step is not disabled,
    // the whole control is not disabled, and the value actually changes
    if (!stepDisabled && !disabled && value !== currentValue) {
      onChange(value);
    }
  }, [onChange, disabled, currentValue]);

  return (
    // New wrapper to include the label and apply frame styles
    <div className={`segmented-control-wrapper ${disabled ? 'disabled' : ''}`}>
      {label && <span className="segmented-control-label">{label}</span>} 
      <div
        className={`segmented-control-container ${disabled ? 'disabled' : ''}`}
        role="group" // Using "group" for simplicity, could use "radiogroup" with more aria attributes
        aria-label={ariaLabel}
      >
        {steps.map((step) => {
          const isActive = step.value === currentValue;
          const isDisabled = step.disabled || disabled;
          return (
            <button
              key={step.value}
              type="button" // Important for forms
              className={`segmented-control-button ${isActive ? 'active' : ''} ${isDisabled ? 'disabled' : ''}`}
              onClick={() => handleClick(step.value, step.disabled)}
              disabled={isDisabled}
              aria-pressed={isActive} // Indicates the pressed state for assistive technologies
              // aria-label={step.label} // Optionally, if label text is not descriptive enough
            >
              {step.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

SegmentedControl.propTypes = {
  steps: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      label: PropTypes.string.isRequired,
      disabled: PropTypes.bool, // Optional: disable individual steps
    })
  ).isRequired,
  currentValue: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool, // Optional: disable the whole control
  label: PropTypes.string, // <-- Add prop type for the label
  ariaLabel: PropTypes.string,
};

export default SegmentedControl; 
import React from 'react';
import PropTypes from 'prop-types';

/**
 * Reusable TextAreaInput component with label.
 */
const TextAreaInput = ({
  id,
  label,
  value,
  onChange,
  placeholder,
  rows = 3, // Default number of rows
  required = false,
  disabled = false,
  error = false, // Optional: for error styling
  helpText,      // Optional: display help text below textarea
  labelProps = {}, // Optional: props for the label element
  textAreaProps = {}, // Optional: additional props for the textarea element
  className = '',  // Optional: additional className for the wrapper div
  ...rest // Capture any other standard HTML textarea attributes
}) => {
  // Combine base class with potential error class and additional classes
  const textAreaClassName = `form-textarea ${error ? 'error-input' : ''} ${textAreaProps.className || ''}`.trim();
  const wrapperClassName = `form-field-wrapper ${className}`.trim(); // Wrapper class

  return (
    <div className={wrapperClassName}>
      {label && (
        <label htmlFor={id} {...labelProps}>
          {label}
          {required && <span style={{ color: 'red', marginLeft: '4px' }}>*</span>}
        </label>
      )}
      <textarea
        id={id}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        required={required}
        disabled={disabled}
        className={textAreaClassName} // Apply combined class name
        aria-invalid={error} // Accessibility for errors
        aria-describedby={helpText ? `${id}-helptext` : undefined}
        {...textAreaProps} // Spread additional textarea-specific props
        {...rest} // Spread any other standard props like 'name', 'maxLength', etc.
      />
      {helpText && (
        <small id={`${id}-helptext`} className="help-text">
          {helpText}
        </small>
      )}
    </div>
  );
};

TextAreaInput.propTypes = {
  id: PropTypes.string.isRequired,
  label: PropTypes.string, // Label is optional
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  placeholder: PropTypes.string,
  rows: PropTypes.number,
  required: PropTypes.bool,
  disabled: PropTypes.bool,
  error: PropTypes.bool,
  helpText: PropTypes.string,
  labelProps: PropTypes.object,
  textAreaProps: PropTypes.object,
  className: PropTypes.string,
};

export default TextAreaInput; 
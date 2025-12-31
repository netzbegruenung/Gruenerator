import React from 'react';
import PropTypes from 'prop-types';

const TextInput = ({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required = false,
  disabled = false,
  error = false, // Optional: for error styling
  helpText,      // Optional: display help text below input
  labelProps = {}, // Optional: props for the label element
  inputProps = {}, // Optional: additional props for the input element
  className = '',  // Optional: additional className for the wrapper div
  ...rest // Capture any other standard HTML input attributes
}) => {
  // Combine base class with potential error class and additional classes
  const inputClassName = `form-input ${error ? 'error-input' : ''} ${inputProps.className || ''}`.trim();
  const wrapperClassName = `form-field-wrapper ${className}`.trim(); // Wrapper class

  return (
    <div className={wrapperClassName}>
      {label && (
        <label htmlFor={id} {...labelProps}>
          {label}
          {required && <span style={{ color: 'red', marginLeft: '4px' }}>*</span>}
        </label>
      )}
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className={inputClassName} // Apply combined class name
        aria-invalid={error} // Accessibility for errors
        aria-describedby={helpText ? `${id}-helptext` : undefined}
        {...inputProps} // Spread additional input-specific props
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

TextInput.propTypes = {
  id: PropTypes.string.isRequired,
  label: PropTypes.string, // Label is optional now
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  onChange: PropTypes.func.isRequired,
  placeholder: PropTypes.string,
  type: PropTypes.string,
  required: PropTypes.bool,
  disabled: PropTypes.bool,
  error: PropTypes.bool,
  helpText: PropTypes.string,
  labelProps: PropTypes.object,
  inputProps: PropTypes.object,
  className: PropTypes.string,
};

export default TextInput;

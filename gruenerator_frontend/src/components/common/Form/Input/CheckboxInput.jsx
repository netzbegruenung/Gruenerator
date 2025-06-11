import React from 'react';
import PropTypes from 'prop-types';

/**
 * Reusable CheckboxInput component with label.
 */
const CheckboxInput = ({
  id,
  label,
  checked,
  onChange,
  disabled = false,
  error = false, // Optional: for error styling (e.g., red border on label or custom marker)
  helpText,      // Optional: display help text below checkbox
  labelProps = {}, // Optional: props for the label element
  inputProps = {}, // Capture inputProps separately
  className = '',  // Optional: additional className for the wrapper div
  ...rest // Capture other standard HTML attributes
}) => {
  // Combine base class with potential error class and additional classes
  // Error styling might need specific CSS rules for checkboxes
  const inputClassName = `form-checkbox ${error ? 'error-input' : ''} ${inputProps.className || ''}`.trim();
  const wrapperClassName = `form-field-wrapper checkbox-wrapper ${className}`.trim(); // Wrapper class
  const labelClassName = `checkbox-label ${labelProps.className || ''}`.trim();

  return (
    <div className={wrapperClassName}>
      <div style={{ display: 'flex', alignItems: 'center' }}> {/* Basic layout */}
        <input
          // Apply spread props first
          {...rest}
          {...inputProps}
          // Apply core controlled component props last to ensure they override any conflicting spread props
          id={id}
          type="checkbox"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className={inputClassName}
          aria-invalid={error}
          aria-describedby={helpText ? `${id}-helptext` : undefined}
        />
        {label && (
          <label htmlFor={id} className={labelClassName} {...labelProps} style={{ marginLeft: 'var(--spacing-xsmall)', cursor: 'pointer', ...labelProps.style }}>
            {label}
            {/* Required marker typically not used for single checkboxes, but could be added if needed */}
          </label>
        )}
      </div>
      {helpText && (
        <small id={`${id}-helptext`} className="help-text" style={{ display: 'block', marginTop: 'var(--spacing-xxsmall)'}}>
          {helpText}
        </small>
      )}
    </div>
  );
};

CheckboxInput.propTypes = {
  id: PropTypes.string.isRequired,
  label: PropTypes.string, // Label is optional
  checked: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  error: PropTypes.bool,
  helpText: PropTypes.string,
  labelProps: PropTypes.object,
  inputProps: PropTypes.object,
  className: PropTypes.string,
};

export default CheckboxInput; 
import React from 'react';
import PropTypes from 'prop-types';

/**
 * Reusable SelectInput component with label and options.
 * Assumes basic styling is provided globally or via parent context.
 */
const SelectInput = ({
  id,
  label,
  value,
  onChange,
  options, // Expects an array of { value: string | number, label: string }
  required = false,
  disabled = false,
  error = false,
  helpText,
  labelProps = {},
  selectProps = {}, // Optional: additional props for the select element
  className = '',
  ...rest
}) => {
  const selectClassName = `form-select ${error ? 'error-input' : ''} ${selectProps.className || ''}`.trim();
  const wrapperClassName = `form-field-wrapper ${className}`.trim();

  return (
    <div className={wrapperClassName}>
      {label && (
        <label htmlFor={id} {...labelProps}>
          {label}
          {required && <span style={{ color: 'red', marginLeft: '4px' }}>*</span>}
        </label>
      )}
      <select
        id={id}
        value={value}
        onChange={onChange}
        required={required}
        disabled={disabled}
        className={selectClassName}
        aria-invalid={error}
        aria-describedby={helpText ? `${id}-helptext` : undefined}
        {...selectProps}
        {...rest}
      >
        {/* Optional: Add a default empty/placeholder option if needed */}
        {/* <option value="" disabled={required}>Bitte wählen...</option> */}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {helpText && (
        <small id={`${id}-helptext`} className="help-text">
          {helpText}
        </small>
      )}
    </div>
  );
};

SelectInput.propTypes = {
  id: PropTypes.string.isRequired,
  label: PropTypes.string,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  onChange: PropTypes.func.isRequired,
  options: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      label: PropTypes.string.isRequired,
    })
  ).isRequired,
  required: PropTypes.bool,
  disabled: PropTypes.bool,
  error: PropTypes.bool,
  helpText: PropTypes.string,
  labelProps: PropTypes.object,
  selectProps: PropTypes.object,
  className: PropTypes.string,
};

export default SelectInput;

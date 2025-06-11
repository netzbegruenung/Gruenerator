import React from 'react';
import PropTypes from 'prop-types';

/**
 * FormFieldWrapper - Container component for consistent form field layout
 * Provides label, input area, help text, and error message structure
 */
const FormFieldWrapper = ({
  children,
  label,
  required = false,
  error,
  helpText,
  htmlFor,
  className = '',
  labelProps = {},
  ...rest
}) => {
  const wrapperClassName = `form-field-wrapper ${className}`.trim();
  const labelClassName = `form-field-label ${required ? 'required' : ''} ${labelProps.className || ''}`.trim();
  const errorId = error ? `${htmlFor}-error` : undefined;
  const helpId = helpText ? `${htmlFor}-help` : undefined;

  return (
    <div className={wrapperClassName} {...rest}>
      {label && (
        <label 
          htmlFor={htmlFor} 
          className={labelClassName}
          {...labelProps}
        >
          {label}
        </label>
      )}
      
      {React.cloneElement(children, {
        'aria-invalid': !!error,
        'aria-describedby': [helpId, errorId].filter(Boolean).join(' ') || undefined
      })}
      
      {helpText && (
        <small id={helpId} className="form-field-help">
          {helpText}
        </small>
      )}
      
      {error && (
        <small id={errorId} className="form-field-error" role="alert" aria-live="polite">
          {error}
        </small>
      )}
    </div>
  );
};

FormFieldWrapper.propTypes = {
  children: PropTypes.element.isRequired,
  label: PropTypes.string,
  required: PropTypes.bool,
  error: PropTypes.string,
  helpText: PropTypes.string,
  htmlFor: PropTypes.string.isRequired,
  className: PropTypes.string,
  labelProps: PropTypes.object
};

export default FormFieldWrapper; 
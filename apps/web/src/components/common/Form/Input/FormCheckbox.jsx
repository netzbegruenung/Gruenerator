import React from 'react';
import PropTypes from 'prop-types';
import { Controller } from 'react-hook-form';

/**
 * FormCheckbox - Modern checkbox component with react-hook-form integration
 * Features: Controller integration, modern styling, accessibility, custom styling
 */
const FormCheckbox = ({
  name,
  label,
  required = false,
  disabled = false,
  helpText,
  className = '',
  control,
  rules = {},
  defaultValue = false,
  checkboxProps = {},
  labelProps = {},
  ...rest
}) => {
  const checkboxId = `form-checkbox-${name}`;
  const wrapperClassName = `checkbox-wrapper ${className}`.trim();
  const checkboxClassName = `form-checkbox ${checkboxProps.className || ''}`.trim();
  const labelClassName = `checkbox-label ${labelProps.className || ''}`.trim();
  const errorId = `${checkboxId}-error`;
  const helpId = helpText ? `${checkboxId}-help` : undefined;

  // If control is provided, use Controller for react-hook-form integration
  if (control) {
    return (
      <Controller
        name={name}
        control={control}
        rules={{ required: required ? 'Dieses Feld muss ausgewählt werden' : false, ...rules }}
        defaultValue={defaultValue}
        render={({ field, fieldState: { error } }) => (
          <div className={wrapperClassName}>
            <div className="checkbox-input-wrapper">
              <input
                {...field}
                id={checkboxId}
                type="checkbox"
                checked={field.value || false}
                disabled={disabled}
                className={`${checkboxClassName} ${error ? 'error-input' : ''}`.trim()}
                aria-invalid={!!error}
                aria-describedby={[helpId, error ? errorId : null].filter(Boolean).join(' ') || undefined}
                {...checkboxProps}
                {...rest}
              />
              {label && (
                <label 
                  htmlFor={checkboxId} 
                  className={labelClassName}
                  {...labelProps}
                >
                  {label}
                  {required && <span className="required-marker"> *</span>}
                </label>
              )}
            </div>
            
            {helpText && (
              <small id={helpId} className="form-field-help">
                {helpText}
              </small>
            )}
            
            {error && (
              <small id={errorId} className="form-field-error" role="alert" aria-live="polite">
                {error.message}
              </small>
            )}
          </div>
        )}
      />
    );
  }

  // Fallback for legacy use without react-hook-form
  return (
    <div className={wrapperClassName}>
      <div className="checkbox-input-wrapper">
        <input
          id={checkboxId}
          name={name}
          type="checkbox"
          disabled={disabled}
          defaultChecked={defaultValue}
          className={checkboxClassName}
          aria-describedby={helpId}
          {...checkboxProps}
          {...rest}
        />
        {label && (
          <label 
            htmlFor={checkboxId} 
            className={labelClassName}
            {...labelProps}
          >
            {label}
            {required && <span className="required-marker"> *</span>}
          </label>
        )}
      </div>
      
      {helpText && (
        <small id={helpId} className="form-field-help">
          {helpText}
        </small>
      )}
    </div>
  );
};

FormCheckbox.propTypes = {
  name: PropTypes.string.isRequired,
  label: PropTypes.string,
  required: PropTypes.bool,
  disabled: PropTypes.bool,
  helpText: PropTypes.string,
  className: PropTypes.string,
  control: PropTypes.object,
  rules: PropTypes.object,
  defaultValue: PropTypes.bool,
  checkboxProps: PropTypes.object,
  labelProps: PropTypes.object
};

export default FormCheckbox; 
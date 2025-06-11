import React from 'react';
import PropTypes from 'prop-types';
import { Controller } from 'react-hook-form';
import FormFieldWrapper from './FormFieldWrapper';

/**
 * FormInput - Modern text input component with react-hook-form integration
 * Features: Controller integration, modern card-based styling, accessibility
 */
const FormInput = ({
  name,
  label,
  placeholder,
  type = 'text',
  required = false,
  disabled = false,
  helpText,
  className = '',
  control,
  rules = {},
  defaultValue = '',
  inputProps = {},
  labelProps = {},
  ...rest
}) => {
  const inputId = `form-input-${name}`;
  const inputClassName = `form-input ${className}`.trim();

  // Require control for react-hook-form integration
  if (!control) {
    console.error('FormInput requires control prop for react-hook-form integration');
    return null;
  }

  return (
    <Controller
      name={name}
      control={control}
      rules={{ required: required ? 'Dieses Feld ist erforderlich' : false, ...rules }}
      defaultValue={defaultValue}
      render={({ field, fieldState: { error } }) => (
        <FormFieldWrapper
          label={label}
          required={required}
          error={error?.message}
          helpText={helpText}
          htmlFor={inputId}
          labelProps={labelProps}
        >
          <input
            {...field}
            id={inputId}
            type={type}
            placeholder={placeholder}
            disabled={disabled}
            className={`${inputClassName} ${error ? 'error-input' : ''}`.trim()}
            onChange={(e) => {
              const value = e.target.value;
              field.onChange(value);
              // Call external onChange if provided
              if (rest.onChange) {
                rest.onChange(value);
              }
            }}
            {...inputProps}
          />
        </FormFieldWrapper>
      )}
    />
  );
};

FormInput.propTypes = {
  name: PropTypes.string.isRequired,
  label: PropTypes.string,
  placeholder: PropTypes.string,
  type: PropTypes.string,
  required: PropTypes.bool,
  disabled: PropTypes.bool,
  helpText: PropTypes.string,
  className: PropTypes.string,
  control: PropTypes.object.isRequired,
  rules: PropTypes.object,
  defaultValue: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  inputProps: PropTypes.object,
  labelProps: PropTypes.object
};

export default FormInput; 
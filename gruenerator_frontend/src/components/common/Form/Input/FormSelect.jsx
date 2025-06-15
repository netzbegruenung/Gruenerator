import React from 'react';
import PropTypes from 'prop-types';
import { Controller } from 'react-hook-form';
import FormFieldWrapper from './FormFieldWrapper';

/**
 * FormSelect - Modern select dropdown component with react-hook-form integration
 * Features: Controller integration, modern styling, accessibility, option groups support
 */
const FormSelect = ({
  name,
  label,
  options = [],
  required = false,
  disabled = false,
  helpText,
  placeholder = 'Bitte wählen...',
  className = '',
  control,
  rules = {},
  defaultValue = '',
  selectProps = {},
  labelProps = {},
  ...rest
}) => {
  const selectId = `form-select-${name}`;
  const selectClassName = `form-select ${className}`.trim();

  // Render options helper
  const renderOptions = () => {
    if (!options || options.length === 0) return null;

    return options.map((option, index) => {
      // Support for option groups
      if (option.group) {
        return (
          <optgroup key={`group-${index}`} label={option.group}>
            {option.options.map((groupOption) => (
              <option key={groupOption.value} value={groupOption.value} disabled={groupOption.disabled}>
                {groupOption.label}
              </option>
            ))}
          </optgroup>
        );
      }

      // Regular options
      return (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      );
    });
  };

  // If control is provided, use Controller for react-hook-form integration
  if (control) {
    return (
      <Controller
        name={name}
        control={control}
        rules={{ required: required ? 'Bitte wählen Sie eine Option' : false, ...rules }}
        defaultValue={defaultValue}
        render={({ field, fieldState: { error } }) => {
          // Clean props for controlled component - remove defaultValue and other conflicting props
          const { defaultValue: _, value: __, onChange: ___, onBlur: ____, ...cleanSelectProps } = selectProps;
          const { defaultValue: _____, value: ______, onChange: _______, onBlur: ________, ...cleanRest } = rest;
          
          return (
            <FormFieldWrapper
              label={label}
              required={required}
              error={error?.message}
              helpText={helpText}
              htmlFor={selectId}
              labelProps={labelProps}
            >
              <select
                id={selectId}
                disabled={disabled}
                className={`${selectClassName} ${error ? 'error-input' : ''}`.trim()}
                value={field.value ?? ''}
                onChange={field.onChange}
                onBlur={field.onBlur}
                name={field.name}
                {...cleanSelectProps}
                {...cleanRest}
              >
                {placeholder && !required && (
                  <option value="" disabled>
                    {placeholder}
                  </option>
                )}
                {renderOptions()}
              </select>
            </FormFieldWrapper>
          );
        }}
      />
    );
  }

  // Uncontrolled component for legacy use without react-hook-form
  const { value: _, onChange: __, onBlur: ___, ...uncontrolledSelectProps } = selectProps;
  const { value: ____, onBlur: ______, control: _______, ...uncontrolledRest } = rest;
  
  return (
    <FormFieldWrapper
      label={label}
      required={required}
      helpText={helpText}
      htmlFor={selectId}
      labelProps={labelProps}
    >
      <select
        id={selectId}
        name={name}
        disabled={disabled}
        defaultValue={defaultValue}
        className={selectClassName}
        {...uncontrolledSelectProps}
        {...uncontrolledRest}
      >
        {placeholder && !required && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {renderOptions()}
      </select>
    </FormFieldWrapper>
  );
};

FormSelect.propTypes = {
  name: PropTypes.string.isRequired,
  label: PropTypes.string,
  options: PropTypes.arrayOf(
    PropTypes.oneOfType([
      PropTypes.shape({
        value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
        label: PropTypes.string.isRequired,
        disabled: PropTypes.bool
      }),
      PropTypes.shape({
        group: PropTypes.string.isRequired,
        options: PropTypes.arrayOf(
          PropTypes.shape({
            value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
            label: PropTypes.string.isRequired,
            disabled: PropTypes.bool
          })
        ).isRequired
      })
    ])
  ),
  required: PropTypes.bool,
  disabled: PropTypes.bool,
  helpText: PropTypes.string,
  placeholder: PropTypes.string,
  className: PropTypes.string,
  control: PropTypes.object,
  rules: PropTypes.object,
  defaultValue: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  selectProps: PropTypes.object,
  labelProps: PropTypes.object
};

export default FormSelect; 
import React from 'react';
import PropTypes from 'prop-types';
import { Controller } from 'react-hook-form';
import FormFieldWrapper from './FormFieldWrapper';
import '../../../../assets/styles/components/form/form-image-select.css';

const FormImageSelect = ({
  name,
  label,
  options = [],
  control,
  value,
  onChange,
  required = false,
  disabled = false,
  helpText,
  className = '',
  rules = {},
  defaultValue = '',
  columns = { desktop: 3, tablet: 2, mobile: 1 },
  aspectRatio = '4 / 5',
  showLabel = false,
  imageProps = {},
  ...rest
}) => {
  const renderImageGrid = (selectedValue, onChange) => {
    return (
      <div
        className={`form-image-select-grid`}
        style={{
          '--grid-cols-desktop': columns.desktop,
          '--grid-cols-tablet': columns.tablet,
          '--grid-cols-mobile': columns.mobile
        }}
        role="radiogroup"
        aria-label={label}
      >
        {options.map((option) => (
          <div
            key={option.value}
            className={`form-image-select-card ${selectedValue === option.value ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!disabled) onChange(option.value);
            }}
            role="radio"
            aria-checked={selectedValue === option.value}
            aria-label={option.label}
            tabIndex={disabled ? -1 : 0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                if (!disabled) onChange(option.value);
              }
            }}
            style={{
              backgroundImage: `url(${option.imageUrl})`,
              aspectRatio: aspectRatio
            }}
            {...imageProps}
          >
            {showLabel && (
              <div className="form-image-select-card__label">
                {option.label}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  if (control) {
    return (
      <Controller
        name={name}
        control={control}
        rules={{ required: required ? 'Bitte wähle eine Option' : false, ...rules }}
        render={({ field, fieldState: { error } }) => (
          <FormFieldWrapper
            label={label}
            required={required}
            error={error?.message}
            helpText={helpText}
            htmlFor={name}
          >
            <div className={`form-image-select ${className}`.trim()}>
              {renderImageGrid(field.value, field.onChange)}
            </div>
          </FormFieldWrapper>
        )}
      />
    );
  }

  // Controlled mode: use value/onChange props
  const selectedValue = value !== undefined ? value : defaultValue;
  const handleChange = onChange || (() => {});

  return (
    <FormFieldWrapper
      label={label}
      required={required}
      helpText={helpText}
      htmlFor={name}
    >
      <div className={`form-image-select ${className}`.trim()}>
        {renderImageGrid(selectedValue, handleChange)}
      </div>
    </FormFieldWrapper>
  );
};

FormImageSelect.propTypes = {
  name: PropTypes.string.isRequired,
  label: PropTypes.string,
  options: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      label: PropTypes.string.isRequired,
      imageUrl: PropTypes.string.isRequired
    })
  ).isRequired,
  control: PropTypes.object,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onChange: PropTypes.func,
  required: PropTypes.bool,
  disabled: PropTypes.bool,
  helpText: PropTypes.string,
  className: PropTypes.string,
  rules: PropTypes.object,
  defaultValue: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  columns: PropTypes.shape({
    desktop: PropTypes.number,
    tablet: PropTypes.number,
    mobile: PropTypes.number
  }),
  aspectRatio: PropTypes.string,
  showLabel: PropTypes.bool,
  imageProps: PropTypes.object
};

export default FormImageSelect;

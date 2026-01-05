import type { JSX } from 'react';
import { Controller, Control } from 'react-hook-form';
import FormFieldWrapper from './FormFieldWrapper';
import '../../../../assets/styles/components/form/form-image-select.css';

interface ImageOption {
  value: string | number;
  label: string;
  imageUrl: string;
}

interface FormImageSelectProps {
  name: string;
  label?: string;
  options?: ImageOption[];
  control?: Control<any>;
  value?: string | number;
  onChange?: (value: string | number) => void;
  required?: boolean;
  disabled?: boolean;
  helpText?: string;
  className?: string;
  rules?: Record<string, unknown>;
  defaultValue?: string | number;
  columns?: {
    desktop?: number;
    tablet?: number;
    mobile?: number
  };
  aspectRatio?: string;
  showLabel?: boolean;
  imageProps?: Record<string, unknown>;
}

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
}: FormImageSelectProps): JSX.Element => {
  const renderImageGrid = (selectedValue: string | number | undefined, onChangeGrid: (value: string | number) => void) => {
    return (
      <div
        className={`form-image-select-grid`}
        style={{
          '--grid-cols-desktop': columns?.desktop ?? 3,
          '--grid-cols-tablet': columns?.tablet ?? 2,
          '--grid-cols-mobile': columns?.mobile ?? 1
        } as React.CSSProperties}
        role="radiogroup"
        aria-label={label}
      >
        {options.map((option) => (
          <div
            key={option.value}
            className={`form-image-select-card ${selectedValue === option.value ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
            onClick={(e: React.MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              if (!disabled) onChangeGrid(option.value);
            }}
            role="radio"
            aria-checked={selectedValue === option.value}
            aria-label={option.label}
            tabIndex={disabled ? -1 : 0}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                if (!disabled) onChangeGrid(option.value);
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
  const handleChange = onChange || (() => { });

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

export default FormImageSelect;

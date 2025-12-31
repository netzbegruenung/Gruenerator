import React from 'react';
import { Controller, Control } from 'react-hook-form';
import FormFieldWrapper from './FormFieldWrapper';
import { useSimpleFormStore } from '../../../../stores/core/simpleFormStore';

interface FormInputProps {
  name: string;
  label?: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
  disabled?: boolean;
  helpText?: string;
  className?: string;
  control?: Control<any>;
  rules?: Record<string, any>;
  defaultValue?: string | number;
  inputProps?: Record<string, any>;
  labelProps?: Record<string, any>;
  tabIndex?: number;
  subtext?: string;
  onChange?: (value: string) => void;
  [key: string]: any;
}

/**
 * FormInput - Modern text input component with react-hook-form integration
 * Features: Controller integration, modern card-based styling, accessibility
 */
const FormInput: React.FC<FormInputProps> = ({
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
  tabIndex,
  ...rest
}) => {
  const inputId = `form-input-${name}`;
  const inputClassName = `form-input ${className}`.trim();

  if (!control) {
    const value = useSimpleFormStore((state) => state.fields[name] ?? defaultValue);
    const setField = useSimpleFormStore((state) => state.setField);

    return (
      <FormFieldWrapper
        label={label}
        required={required}
        helpText={helpText}
        htmlFor={inputId}
        labelProps={labelProps}
      >
        <input
          id={inputId}
          name={name}
          type={type}
          placeholder={placeholder}
          disabled={disabled}
          className={inputClassName}
          value={value}
          tabIndex={tabIndex}
          onChange={(e) => {
            const newVal = e.target.value;
            setField(name, newVal);
            if (rest.onChange) {
              rest.onChange(newVal);
            }
          }}
          {...inputProps}
          {...rest}
        />
      </FormFieldWrapper>
    );
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
            tabIndex={tabIndex}
            onChange={(e) => {
              const value = e.target.value;
              field.onChange(value);
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

export default FormInput;

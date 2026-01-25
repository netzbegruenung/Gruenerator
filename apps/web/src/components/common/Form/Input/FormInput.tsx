import React from 'react';
import { Controller, type Control, type FieldValues } from 'react-hook-form';

import { useSimpleFormStore } from '../../../../stores/core/simpleFormStore';

import FormFieldWrapper from './FormFieldWrapper';

interface FormInputProps {
  name: string;
  label?: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
  disabled?: boolean;
  helpText?: string;
  className?: string;
  control?: Control<FieldValues>;
  rules?: Record<string, unknown>;
  defaultValue?: string | number;
  inputProps?: Record<string, unknown>;
  labelProps?: Record<string, unknown>;
  tabIndex?: number;
  subtext?: string;
  onChange?: (value: string) => void;
  [key: string]: unknown;
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
    const rawValue = useSimpleFormStore((state) => state.fields[name]);
    const value = (rawValue as string) ?? defaultValue;
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
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            const newVal = e.target.value;
            setField(name, newVal);
            if (rest.onChange) {
              (rest.onChange as (value: string) => void)(newVal);
            }
          }}
          {...inputProps}
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
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
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

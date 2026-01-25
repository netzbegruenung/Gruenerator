import {
  Controller,
  type Control,
  type RegisterOptions,
  type FieldValues,
  type Path,
} from 'react-hook-form';

import FormFieldWrapper from './FormFieldWrapper';

import type { SelectHTMLAttributes, LabelHTMLAttributes } from 'react';

export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

export interface SelectOptionGroup {
  group: string;
  options: SelectOption[];
}

export type SelectOptionType = SelectOption | SelectOptionGroup;

function isOptionGroup(option: SelectOptionType): option is SelectOptionGroup {
  return 'group' in option;
}

export interface FormSelectProps<T extends FieldValues = FieldValues> extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'name' | 'defaultValue'
> {
  name: Path<T>;
  label?: string;
  options?: SelectOptionType[];
  required?: boolean;
  disabled?: boolean;
  helpText?: string;
  placeholder?: string;
  className?: string;
  control?: Control<T>;
  rules?: RegisterOptions<T>;
  defaultValue?: string | number;
  selectProps?: SelectHTMLAttributes<HTMLSelectElement>;
  labelProps?: LabelHTMLAttributes<HTMLLabelElement>;
}

function FormSelect<T extends FieldValues = FieldValues>({
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
}: FormSelectProps<T>) {
  const selectId = `form-select-${String(name)}`;
  const selectClassName = `form-select ${className}`.trim();

  const renderOptions = () => {
    if (!options || options.length === 0) return null;

    return options.map((option, index) => {
      if (isOptionGroup(option)) {
        return (
          <optgroup key={`group-${index}`} label={option.group}>
            {option.options.map((groupOption) => (
              <option
                key={groupOption.value}
                value={groupOption.value}
                disabled={groupOption.disabled}
              >
                {groupOption.label}
              </option>
            ))}
          </optgroup>
        );
      }

      return (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      );
    });
  };

  if (control) {
    return (
      <Controller
        name={name}
        control={control}
        rules={{
          required: required ? 'Bitte wählen Sie eine Option' : false,
          ...rules,
        }}
        defaultValue={defaultValue as never}
        render={({ field, fieldState: { error } }) => {
          const {
            defaultValue: _dv,
            value: _v,
            onChange: _oc,
            onBlur: _ob,
            ...cleanSelectProps
          } = selectProps as SelectHTMLAttributes<HTMLSelectElement> & { defaultValue?: unknown };
          const {
            defaultValue: _dv2,
            value: _v2,
            onChange: _oc2,
            onBlur: _ob2,
            ...cleanRest
          } = rest as SelectHTMLAttributes<HTMLSelectElement> & { defaultValue?: unknown };

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

  const { value: _v, onChange: _oc, onBlur: _ob, ...uncontrolledSelectProps } = selectProps;
  const { value: _v2, onBlur: _ob2, ...uncontrolledRest } = rest as Record<string, unknown>;

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
        name={String(name)}
        disabled={disabled}
        defaultValue={defaultValue}
        className={selectClassName}
        {...uncontrolledSelectProps}
        {...(uncontrolledRest as SelectHTMLAttributes<HTMLSelectElement>)}
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
}

export default FormSelect;

import type { InputHTMLAttributes, LabelHTMLAttributes } from 'react';
import { Controller, type Control, type RegisterOptions, type FieldValues, type Path } from 'react-hook-form';

export interface FormCheckboxProps<T extends FieldValues = FieldValues>
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'name' | 'type' | 'defaultValue'> {
  name: Path<T>;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  helpText?: string;
  className?: string;
  control?: Control<T>;
  rules?: RegisterOptions<T>;
  defaultValue?: boolean;
  checkboxProps?: InputHTMLAttributes<HTMLInputElement>;
  labelProps?: LabelHTMLAttributes<HTMLLabelElement>;
}

function FormCheckbox<T extends FieldValues = FieldValues>({
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
}: FormCheckboxProps<T>) {
  const checkboxId = `form-checkbox-${String(name)}`;
  const wrapperClassName = `checkbox-wrapper ${className}`.trim();
  const checkboxClassName = `form-checkbox ${checkboxProps.className || ''}`.trim();
  const labelClassName = `checkbox-label ${labelProps.className || ''}`.trim();
  const errorId = `${checkboxId}-error`;
  const helpId = helpText ? `${checkboxId}-help` : undefined;

  if (control) {
    return (
      <Controller
        name={name}
        control={control}
        rules={{
          required: required ? 'Dieses Feld muss ausgewählt werden' : false,
          ...rules
        }}
        defaultValue={defaultValue as never}
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
                aria-describedby={
                  [helpId, error ? errorId : null].filter(Boolean).join(' ') || undefined
                }
                {...checkboxProps}
                {...rest}
              />
              {label && (
                <label htmlFor={checkboxId} className={labelClassName} {...labelProps}>
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

  return (
    <div className={wrapperClassName}>
      <div className="checkbox-input-wrapper">
        <input
          id={checkboxId}
          name={String(name)}
          type="checkbox"
          disabled={disabled}
          defaultChecked={defaultValue}
          className={checkboxClassName}
          aria-describedby={helpId}
          {...checkboxProps}
          {...rest}
        />
        {label && (
          <label htmlFor={checkboxId} className={labelClassName} {...labelProps}>
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
}

export default FormCheckbox;

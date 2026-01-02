import { cloneElement, type ReactElement, type HTMLAttributes, type LabelHTMLAttributes } from 'react';

export interface FormFieldWrapperProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactElement;
  label?: string;
  required?: boolean;
  error?: string;
  helpText?: string;
  htmlFor: string;
  className?: string;
  labelProps?: LabelHTMLAttributes<HTMLLabelElement>;
}

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
}: FormFieldWrapperProps) => {
  const wrapperClassName = `form-field-wrapper ${className}`.trim();
  const labelClassName = `form-field-label ${required ? 'required' : ''} ${labelProps.className || ''}`.trim();
  const errorId = error ? `${htmlFor}-error` : undefined;
  const helpId = helpText ? `${htmlFor}-help` : undefined;

  return (
    <div className={wrapperClassName} {...rest}>
      {label && (
        <label htmlFor={htmlFor} className={labelClassName} {...labelProps}>
          {label}
        </label>
      )}

      {cloneElement(children, {
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

export default FormFieldWrapper;

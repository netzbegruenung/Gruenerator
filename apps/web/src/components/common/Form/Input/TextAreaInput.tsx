import type { ChangeEvent, TextareaHTMLAttributes, LabelHTMLAttributes } from 'react';

export interface TextAreaInputProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'onChange' | 'value'
> {
  id: string;
  label?: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  rows?: number;
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  helpText?: string;
  labelProps?: LabelHTMLAttributes<HTMLLabelElement>;
  textAreaProps?: TextareaHTMLAttributes<HTMLTextAreaElement>;
  className?: string;
}

const TextAreaInput = ({
  id,
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  required = false,
  disabled = false,
  error = false,
  helpText,
  labelProps = {},
  textAreaProps = {},
  className = '',
  ...rest
}: TextAreaInputProps) => {
  const textAreaClassName =
    `form-textarea ${error ? 'error-input' : ''} ${textAreaProps.className || ''}`.trim();
  const wrapperClassName = `form-field-wrapper ${className}`.trim();

  return (
    <div className={wrapperClassName}>
      {label && (
        <label htmlFor={id} {...labelProps}>
          {label}
          {required && <span style={{ color: 'red', marginLeft: '4px' }}>*</span>}
        </label>
      )}
      <textarea
        id={id}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        required={required}
        disabled={disabled}
        className={textAreaClassName}
        aria-invalid={error}
        aria-describedby={helpText ? `${id}-helptext` : undefined}
        {...textAreaProps}
        {...rest}
      />
      {helpText && (
        <small id={`${id}-helptext`} className="help-text">
          {helpText}
        </small>
      )}
    </div>
  );
};

export default TextAreaInput;

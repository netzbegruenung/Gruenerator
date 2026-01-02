import type {
  ChangeEvent,
  InputHTMLAttributes,
  LabelHTMLAttributes
} from 'react';

export interface TextInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  id: string;
  label?: string;
  value: string | number;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  helpText?: string;
  labelProps?: LabelHTMLAttributes<HTMLLabelElement>;
  inputProps?: InputHTMLAttributes<HTMLInputElement>;
  className?: string;
}

const TextInput = ({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required = false,
  disabled = false,
  error = false,
  helpText,
  labelProps = {},
  inputProps = {},
  className = '',
  ...rest
}: TextInputProps) => {
  const inputClassName = `form-input ${error ? 'error-input' : ''} ${inputProps.className || ''}`.trim();
  const wrapperClassName = `form-field-wrapper ${className}`.trim();

  return (
    <div className={wrapperClassName}>
      {label && (
        <label htmlFor={id} {...labelProps}>
          {label}
          {required && <span style={{ color: 'red', marginLeft: '4px' }}>*</span>}
        </label>
      )}
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className={inputClassName}
        aria-invalid={error}
        aria-describedby={helpText ? `${id}-helptext` : undefined}
        {...inputProps}
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

export default TextInput;

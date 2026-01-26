import type { ChangeEvent, InputHTMLAttributes, LabelHTMLAttributes, CSSProperties } from 'react';

export interface CheckboxInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'checked' | 'type'
> {
  id: string;
  label?: string;
  checked: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  error?: boolean;
  helpText?: string;
  labelProps?: LabelHTMLAttributes<HTMLLabelElement> & { style?: CSSProperties };
  inputProps?: InputHTMLAttributes<HTMLInputElement>;
  className?: string;
}

const CheckboxInput = ({
  id,
  label,
  checked,
  onChange,
  disabled = false,
  error = false,
  helpText,
  labelProps = {},
  inputProps = {},
  className = '',
  ...rest
}: CheckboxInputProps) => {
  const inputClassName =
    `form-checkbox ${error ? 'error-input' : ''} ${inputProps.className || ''}`.trim();
  const wrapperClassName = `form-field-wrapper checkbox-wrapper ${className}`.trim();
  const labelClassName = `checkbox-label ${labelProps.className || ''}`.trim();

  return (
    <div className={wrapperClassName}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <input
          {...rest}
          {...inputProps}
          id={id}
          type="checkbox"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className={inputClassName}
          aria-invalid={error}
          aria-describedby={helpText ? `${id}-helptext` : undefined}
        />
        {label && (
          <label
            htmlFor={id}
            className={labelClassName}
            {...labelProps}
            style={{
              marginLeft: 'var(--spacing-xsmall)',
              cursor: 'pointer',
              ...labelProps.style,
            }}
          >
            {label}
          </label>
        )}
      </div>
      {helpText && (
        <small
          id={`${id}-helptext`}
          className="help-text"
          style={{ display: 'block', marginTop: 'var(--spacing-xxsmall)' }}
        >
          {helpText}
        </small>
      )}
    </div>
  );
};

export default CheckboxInput;

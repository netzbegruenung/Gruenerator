import React from 'react';
import PropTypes from 'prop-types';
import { Controller } from 'react-hook-form';
import TextareaAutosize from 'react-textarea-autosize';
import FormFieldWrapper from './FormFieldWrapper';
import { useSimpleFormStore } from '../../../../stores/core/simpleFormStore';
import { useFormStateSelector } from '../FormStateProvider';

/**
 * FormAutoInput - Large input component with auto-resize for extensive text input
 * Features: Auto-resize, advanced formatting, validation, character count
 */
const FormAutoInput = ({
  name,
  label,
  placeholder,
  required = false,
  disabled = false,
  helpText,
  className = '',
  control,
  rules = {},
  defaultValue = '',
  minRows: minRowsProp = 5,
  maxRows = 20,
  showCharacterCount = true,
  maxLength = 5000,
  showWordCount = false,
  autoFormat = false,
  textareaProps = {},
  labelProps = {},
  ...rest
}) => {
  // Read isStartMode from store (set by BaseForm)
  let storeIsStartMode = false;
  try {
    storeIsStartMode = useFormStateSelector(state => state.isStartMode);
  } catch {
    // Not inside FormStateProvider - use default
  }
  const minRows = storeIsStartMode ? 2 : minRowsProp;
  const autoInputId = `form-auto-input-${name}`;
  const autoInputClassName = `form-textarea form-auto-input ${className}`.trim();

  // Text statistics component
  const TextStats = ({ value }) => {
    if (!showCharacterCount && !showWordCount) return null;
    
    const text = value || '';
    const charCount = text.length;
    const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
    const isNearLimit = maxLength && charCount > maxLength * 0.8;
    const isOverLimit = maxLength && charCount > maxLength;
    
    return (
      <div className="text-stats" style={{ 
        display: 'flex', 
        justifyContent: 'space-between',
        marginTop: 'var(--spacing-xxsmall)',
        fontSize: '13px'
      }}>
        {showCharacterCount && (
          <small 
            className={`character-count ${isNearLimit ? 'near-limit' : ''} ${isOverLimit ? 'over-limit' : ''}`}
            style={{ 
              color: isOverLimit ? 'var(--error-red)' : isNearLimit ? 'var(--warning-color, orange)' : 'var(--font-color-disabled)'
            }}
          >
            {charCount}{maxLength ? `/${maxLength}` : ''} Zeichen
          </small>
        )}
        {showWordCount && (
          <small className="word-count" style={{ color: 'var(--font-color-disabled)' }}>
            {wordCount} Wörter
          </small>
        )}
      </div>
    );
  };

  // Auto-formatting function
  const formatText = (text) => {
    if (!autoFormat || !text) return text;
    
    // Basic auto-formatting: clean multiple spaces, fix punctuation spacing
    return text
      .replace(/\s+/g, ' ') // Multiple spaces to single space
      .replace(/\s+([.!?])/g, '$1') // Remove space before punctuation
      .replace(/([.!?])\s*([A-ZÄÖÜ])/g, '$1 $2') // Ensure space after sentence endings
      .trim();
  };

  // If control is provided, use Controller for react-hook-form integration
  if (control) {
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
            htmlFor={autoInputId}
            labelProps={labelProps}
          >
            <div>
              <TextareaAutosize
                {...field}
                id={autoInputId}
                placeholder={placeholder}
                disabled={disabled}
                minRows={minRows}
                maxRows={maxRows}
                maxLength={maxLength}
                className={`${autoInputClassName} ${error ? 'error-input' : ''}`.trim()}
                onBlur={(e) => {
                  if (autoFormat) {
                    const formatted = formatText(e.target.value);
                    field.onChange(formatted);
                  }
                  field.onBlur(e);
                }}
                {...textareaProps}
                {...rest}
              />
              <TextStats value={field.value} />
            </div>
          </FormFieldWrapper>
        )}
      />
    );
  }

  // Zustand fallback controlled component
  const value = useSimpleFormStore((state) => state.fields[name] ?? defaultValue);
  const setField = useSimpleFormStore((state) => state.setField);

  return (
    <FormFieldWrapper
      label={label}
      required={required}
      helpText={helpText}
      htmlFor={autoInputId}
      labelProps={labelProps}
    >
      <div>
        <TextareaAutosize
          id={autoInputId}
          name={name}
          placeholder={placeholder}
          disabled={disabled}
          minRows={minRows}
          maxRows={maxRows}
          maxLength={maxLength}
          className={autoInputClassName}
          value={value}
          onChange={(e) => {
            let newVal = e.target.value;
            if (autoFormat) {
              newVal = formatText(newVal);
            }
            setField(name, newVal);
            if (rest.onChange) {
              rest.onChange(newVal);
            }
          }}
          {...textareaProps}
          {...rest}
        />
        <TextStats value={value} />
      </div>
    </FormFieldWrapper>
  );
};

FormAutoInput.propTypes = {
  name: PropTypes.string.isRequired,
  label: PropTypes.string,
  placeholder: PropTypes.string,
  required: PropTypes.bool,
  disabled: PropTypes.bool,
  helpText: PropTypes.string,
  className: PropTypes.string,
  control: PropTypes.object,
  rules: PropTypes.object,
  defaultValue: PropTypes.string,
  minRows: PropTypes.number,
  maxRows: PropTypes.number,
  showCharacterCount: PropTypes.bool,
  maxLength: PropTypes.number,
  showWordCount: PropTypes.bool,
  autoFormat: PropTypes.bool,
  textareaProps: PropTypes.object,
  labelProps: PropTypes.object
};

export default FormAutoInput; 
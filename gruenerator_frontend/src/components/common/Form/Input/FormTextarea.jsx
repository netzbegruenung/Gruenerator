import React from 'react';
import PropTypes from 'prop-types';
import { Controller } from 'react-hook-form';
import TextareaAutosize from 'react-textarea-autosize';
import FormFieldWrapper from './FormFieldWrapper';
import { useSimpleFormStore } from '../../../../stores/core/simpleFormStore';

/**
 * FormTextarea - Modern textarea component with auto-resize and react-hook-form integration
 * Features: Auto-resize, Controller integration, character count, accessibility
 */
const FormTextarea = ({
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
  minRows = 3,
  maxRows = 10,
  showCharacterCount = false,
  maxLength,
  textareaProps = {},
  labelProps = {},
  tabIndex,
  ...rest
}) => {
  const textareaId = `form-textarea-${name}`;
  const textareaClassName = `form-textarea ${className}`.trim();

  // Character count component
  const CharacterCount = ({ value }) => {
    if (!showCharacterCount && !maxLength) return null;
    
    const currentLength = value ? value.length : 0;
    const isNearLimit = maxLength && currentLength > maxLength * 0.8;
    const isOverLimit = maxLength && currentLength > maxLength;
    
    return (
      <small 
        className={`form-field-help character-count ${isNearLimit ? 'near-limit' : ''} ${isOverLimit ? 'over-limit' : ''}`}
        style={{ 
          textAlign: 'right',
          color: isOverLimit ? 'var(--error-red)' : isNearLimit ? 'var(--warning-color, orange)' : undefined
        }}
      >
        {currentLength}{maxLength ? `/${maxLength}` : ''} Zeichen
      </small>
    );
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
            htmlFor={textareaId}
            labelProps={labelProps}
          >
            <div>
              <TextareaAutosize
                {...field}
                id={textareaId}
                placeholder={placeholder}
                disabled={disabled}
                minRows={minRows}
                maxRows={maxRows}
                maxLength={maxLength}
                className={`${textareaClassName} ${error ? 'error-input' : ''}`.trim()}
                tabIndex={tabIndex}
                onChange={(e) => {
                  field.onChange(e);
                  // Call external onChange if provided
                  if (rest.onChange) {
                    rest.onChange(e.target.value);
                  }
                }}
                {...textareaProps}
              />
              <CharacterCount value={field.value} />
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
      htmlFor={textareaId}
      labelProps={labelProps}
    >
      <div>
        <TextareaAutosize
          id={textareaId}
          name={name}
          placeholder={placeholder}
          disabled={disabled}
          minRows={minRows}
          maxRows={maxRows}
          maxLength={maxLength}
          className={textareaClassName}
          value={value}
          tabIndex={tabIndex}
          onChange={(e) => {
            const newVal = e.target.value;
            setField(name, newVal);
            if (rest.onChange) {
              rest.onChange(newVal);
            }
          }}
          {...textareaProps}
          {...rest}
        />
        <CharacterCount value={value} />
      </div>
    </FormFieldWrapper>
  );
};

FormTextarea.propTypes = {
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
  textareaProps: PropTypes.object,
  labelProps: PropTypes.object,
  tabIndex: PropTypes.number
};

export default FormTextarea; 
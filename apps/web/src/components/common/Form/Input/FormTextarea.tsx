import React, { useEffect, useState } from 'react';
import { Controller, Control } from 'react-hook-form';
import TextareaAutosize from 'react-textarea-autosize';
import FormFieldWrapper from './FormFieldWrapper';
import { useSimpleFormStore } from '../../../../stores/core/simpleFormStore';
import { detectUrls } from '../../../../utils/urlDetection';
import useDebounce from '../../../../components/hooks/useDebounce';
import { useFormStateSelector } from '../FormStateProvider';
import { COMBINED_DICTIONARY } from '../../../../hooks/useTextAutocomplete';
import TextareaWithAutocomplete from './TextareaWithAutocomplete';
import '../../../../assets/styles/components/form/form-inputs.css';

interface FormTextareaProps {
  name: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  helpText?: string;
  className?: string;
  control?: Control<any>;
  rules?: Record<string, any>;
  defaultValue?: string;
  minRows?: number;
  maxRows?: number;
  showCharacterCount?: boolean;
  maxLength?: number;
  textareaProps?: Record<string, any>;
  labelProps?: Record<string, any>;
  tabIndex?: number;
  enableUrlDetection?: boolean;
  onUrlsDetected?: (urls: string[]) => void;
  enableTextAutocomplete?: boolean;
  autocompleteDictionary?: string[];
  autocompleteMinChars?: number;
  autocompleteAddHashtag?: boolean;
  onChange?: (value: string) => void;
  [key: string]: any;
}

interface CharacterCountProps {
  value: string | undefined;
}

/**
 * FormTextarea - Modern textarea component with auto-resize and react-hook-form integration
 * Features: Auto-resize, Controller integration, character count, accessibility, URL detection, text autocomplete
 */
const FormTextarea: React.FC<FormTextareaProps> = ({
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
  minRows: minRowsProp = 3,
  maxRows = 10,
  showCharacterCount = false,
  maxLength,
  textareaProps = {},
  labelProps = {},
  tabIndex,
  enableUrlDetection = false,
  onUrlsDetected,
  enableTextAutocomplete = false,
  autocompleteDictionary = COMBINED_DICTIONARY,
  autocompleteMinChars = 3,
  autocompleteAddHashtag = true,
  onChange,
  ...rest
}) => {
  let storeIsStartMode = false;
  try {
    storeIsStartMode = useFormStateSelector(state => state.isStartMode);
  } catch {
    // Not inside FormStateProvider - use default
  }
  const minRows = storeIsStartMode ? 2 : minRowsProp;

  const textareaId = `form-textarea-${name}`;
  const textareaClassName = `form-textarea ${className}`.trim();

  const [detectedUrls, setDetectedUrls] = useState<string[]>([]);
  const [fieldValue, setFieldValue] = useState('');

  const debouncedValue = useDebounce(fieldValue, 1000);

  useEffect(() => {
    if (enableUrlDetection && debouncedValue) {
      const urls = detectUrls(debouncedValue);
      setDetectedUrls(urls);

      if (urls.length > 0) {
        console.log(`[FormTextarea] Detected ${urls.length} URLs: ${urls.join(', ')}`);
        if (onUrlsDetected) {
          onUrlsDetected(urls);
        }
      }
    }
  }, [debouncedValue, enableUrlDetection, onUrlsDetected]);

  const CharacterCount: React.FC<CharacterCountProps> = ({ value }) => {
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
            {enableTextAutocomplete ? (
              <TextareaWithAutocomplete
                field={field}
                error={error}
                textareaId={textareaId}
                placeholder={placeholder}
                disabled={disabled}
                minRows={minRows}
                maxRows={maxRows}
                maxLength={maxLength}
                className={textareaClassName}
                tabIndex={tabIndex}
                textareaProps={textareaProps}
                enableUrlDetection={enableUrlDetection}
                onFieldValueChange={setFieldValue}
                onExternalChange={onChange}
                dictionary={autocompleteDictionary}
                minChars={autocompleteMinChars}
                addHashtagOnAccept={autocompleteAddHashtag}
                showCharacterCount={showCharacterCount}
                CharacterCount={CharacterCount}
              />
            ) : (
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

                    if (enableUrlDetection) {
                      setFieldValue(e.target.value);
                    }

                    if (onChange) {
                      onChange(e.target.value);
                    }
                  }}
                  {...textareaProps}
                />
                <CharacterCount value={field.value} />
              </div>
            )}
          </FormFieldWrapper>
        )}
      />
    );
  }

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

            if (enableUrlDetection) {
              setFieldValue(newVal);
            }

            if (onChange) {
              onChange(newVal);
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

export default FormTextarea;

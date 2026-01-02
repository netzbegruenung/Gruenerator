import type { TextareaHTMLAttributes, LabelHTMLAttributes, FocusEvent } from 'react';
import {
  Controller,
  type Control,
  type RegisterOptions,
  type FieldValues,
  type Path
} from 'react-hook-form';
import TextareaAutosize from 'react-textarea-autosize';
import FormFieldWrapper from './FormFieldWrapper';
import { useSimpleFormStore } from '../../../../stores/core/simpleFormStore';
import { useFormStateSelector } from '../FormStateProvider';

interface TextStatsProps {
  value: string;
  showCharacterCount: boolean;
  showWordCount: boolean;
  maxLength?: number;
}

const TextStats = ({ value, showCharacterCount, showWordCount, maxLength }: TextStatsProps) => {
  if (!showCharacterCount && !showWordCount) return null;

  const text = value || '';
  const charCount = text.length;
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const isNearLimit = maxLength ? charCount > maxLength * 0.8 : false;
  const isOverLimit = maxLength ? charCount > maxLength : false;

  return (
    <div
      className="text-stats"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: 'var(--spacing-xxsmall)',
        fontSize: '13px'
      }}
    >
      {showCharacterCount && (
        <small
          className={`character-count ${isNearLimit ? 'near-limit' : ''} ${isOverLimit ? 'over-limit' : ''}`}
          style={{
            color: isOverLimit
              ? 'var(--error-red)'
              : isNearLimit
                ? 'var(--warning-color, orange)'
                : 'var(--font-color-disabled)'
          }}
        >
          {charCount}
          {maxLength ? `/${maxLength}` : ''} Zeichen
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

export interface FormAutoInputProps<T extends FieldValues = FieldValues>
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'name' | 'defaultValue' | 'onChange'> {
  name: Path<T>;
  label?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  helpText?: string;
  className?: string;
  control?: Control<T>;
  rules?: RegisterOptions<T>;
  defaultValue?: string;
  minRows?: number;
  maxRows?: number;
  showCharacterCount?: boolean;
  maxLength?: number;
  showWordCount?: boolean;
  autoFormat?: boolean;
  textareaProps?: TextareaHTMLAttributes<HTMLTextAreaElement>;
  labelProps?: LabelHTMLAttributes<HTMLLabelElement>;
  onChange?: (value: string) => void;
}

const formatText = (text: string, autoFormat: boolean): string => {
  if (!autoFormat || !text) return text;

  return text
    .replace(/\s+/g, ' ')
    .replace(/\s+([.!?])/g, '$1')
    .replace(/([.!?])\s*([A-ZÄÖÜ])/g, '$1 $2')
    .trim();
};

function FormAutoInput<T extends FieldValues = FieldValues>({
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
  onChange: onChangeProp,
  ...rest
}: FormAutoInputProps<T>) {
  let storeIsStartMode = false;
  try {
    storeIsStartMode = useFormStateSelector((state) => state.isStartMode);
  } catch {
    // Not inside FormStateProvider - use default
  }

  const minRows = storeIsStartMode ? 2 : minRowsProp;
  const autoInputId = `form-auto-input-${String(name)}`;
  const autoInputClassName = `form-textarea form-auto-input ${className}`.trim();

  if (control) {
    return (
      <Controller
        name={name}
        control={control}
        rules={{
          required: required ? 'Dieses Feld ist erforderlich' : false,
          ...rules
        }}
        defaultValue={defaultValue as never}
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
                {...textareaProps}
                {...rest}
                id={autoInputId}
                placeholder={placeholder}
                disabled={disabled}
                minRows={minRows}
                maxRows={maxRows}
                maxLength={maxLength}
                className={`${autoInputClassName} ${error ? 'error-input' : ''}`.trim()}
                style={undefined}
                onBlur={(e: FocusEvent<HTMLTextAreaElement>) => {
                  if (autoFormat) {
                    const formatted = formatText(e.target.value, true);
                    field.onChange(formatted);
                  }
                  field.onBlur();
                }}
              />
              <TextStats
                value={field.value || ''}
                showCharacterCount={showCharacterCount}
                showWordCount={showWordCount}
                maxLength={maxLength}
              />
            </div>
          </FormFieldWrapper>
        )}
      />
    );
  }

  // Zustand fallback controlled component
  const rawValue = useSimpleFormStore((state) => state.fields[String(name)]);
  const value = (rawValue as string) ?? defaultValue;
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
          {...textareaProps}
          {...rest}
          id={autoInputId}
          name={String(name)}
          placeholder={placeholder}
          disabled={disabled}
          minRows={minRows}
          maxRows={maxRows}
          maxLength={maxLength}
          className={autoInputClassName}
          value={value}
          style={undefined}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
            let newVal = e.target.value;
            if (autoFormat) {
              newVal = formatText(newVal, true);
            }
            setField(String(name), newVal);
            if (onChangeProp) {
              onChangeProp(newVal);
            }
          }}
        />
        <TextStats
          value={value}
          showCharacterCount={showCharacterCount}
          showWordCount={showWordCount}
          maxLength={maxLength}
        />
      </div>
    </FormFieldWrapper>
  );
}

export default FormAutoInput;

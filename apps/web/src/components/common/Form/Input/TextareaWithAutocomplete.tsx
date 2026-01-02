import { JSX, useCallback, ComponentType, ChangeEvent, KeyboardEvent, RefCallback, MutableRefObject } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { ControllerRenderProps, FieldError } from 'react-hook-form';
import { useTextAutocomplete, COMBINED_DICTIONARY } from '../../../../hooks/useTextAutocomplete';
import '../../../../assets/styles/components/form/form-inputs.css';

/**
 * TextareaWithAutocomplete - Standalone textarea component with ghost-text autocomplete
 *
 * This component must be separate from FormTextarea to prevent hook state loss
 * caused by component recreation on re-renders.
 */
interface TextareaWithAutocompleteProps {
  field: ControllerRenderProps<Record<string, unknown>, string>;
  error?: FieldError;
  textareaId?: string;
  placeholder?: string;
  disabled?: boolean;
  minRows?: number;
  maxRows?: number;
  maxLength?: number;
  className?: string;
  tabIndex?: number;
  textareaProps?: Record<string, unknown>;
  enableUrlDetection?: boolean;
  onFieldValueChange?: (value: string) => void;
  onExternalChange?: (value: string) => void;
  dictionary?: string[];
  minChars?: number;
  addHashtagOnAccept?: boolean;
  showCharacterCount?: boolean;
  CharacterCount?: ComponentType<{ value: string | undefined }>;
}

const TextareaWithAutocomplete = ({
  field,
  error,
  textareaId,
  placeholder,
  disabled,
  minRows,
  maxRows,
  maxLength,
  className,
  tabIndex,
  textareaProps = {},
  enableUrlDetection = false,
  onFieldValueChange,
  onExternalChange,
  dictionary = COMBINED_DICTIONARY,
  minChars = 3,
  addHashtagOnAccept = true,
  showCharacterCount = false,
  CharacterCount
}: TextareaWithAutocompleteProps): JSX.Element => {
  // Cast field.value to string since we know it's a text field
  const fieldValue = (field.value as string) || '';

  const autocomplete = useTextAutocomplete(fieldValue, field.onChange, {
    dictionary,
    minChars,
    addHashtagOnAccept
  });

  const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    autocomplete.handleChange(e);

    if (enableUrlDetection && onFieldValueChange) {
      onFieldValueChange(e.target.value);
    }

    if (onExternalChange) {
      onExternalChange(e.target.value);
    }
  }, [autocomplete, enableUrlDetection, onFieldValueChange, onExternalChange]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    autocomplete.handleKeyDown(e);
    const onKeyDown = textareaProps.onKeyDown as ((e: KeyboardEvent<HTMLTextAreaElement>) => void) | undefined;
    if (onKeyDown) {
      onKeyDown(e);
    }
  }, [autocomplete, textareaProps]);

  const hasActiveSuggestion = !!autocomplete.suggestionSuffix;

  return (
    <div className={`textarea-autocomplete-wrapper${hasActiveSuggestion ? ' textarea-autocomplete-wrapper--active' : ''}`}>
      {hasActiveSuggestion && (
        <div className="textarea-ghost-text">
          <span className="textarea-ghost-prefix">{autocomplete.ghostPrefix}</span>
          <span className="textarea-ghost-suffix">{autocomplete.suggestionSuffix}</span>
        </div>
      )}
      <TextareaAutosize
        name={field.name}
        value={fieldValue}
        onBlur={field.onBlur}
        ref={(el) => {
          if (typeof field.ref === 'function') {
            (field.ref as RefCallback<HTMLTextAreaElement>)(el);
          } else if (field.ref && typeof field.ref === 'object') {
            (field.ref as MutableRefObject<HTMLTextAreaElement | null>).current = el;
          }
          autocomplete.textareaRef.current = el;
        }}
        id={textareaId}
        placeholder={placeholder}
        disabled={disabled}
        minRows={minRows}
        maxRows={maxRows}
        maxLength={maxLength}
        className={`${className} ${error ? 'error-input' : ''}`.trim()}
        tabIndex={tabIndex}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        {...textareaProps}
      />
      {hasActiveSuggestion && (
        <span className="textarea-autocomplete-hint">Tab um zu akzeptieren</span>
      )}
      {CharacterCount && <CharacterCount value={fieldValue} />}
    </div>
  );
};

export default TextareaWithAutocomplete;
